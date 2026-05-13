# Remake agents + redesign nettoyage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 3 unused agents (letter, summary, hearing), then redesign the file cleaner with rule-based classification and a one-click validation UI.

**Architecture:** The three deprecated agents are deleted everywhere (frontend, backend, tools, workflows). The cleaner becomes synchronous: `POST /api/cleaner/scan` returns proposals in one call using rule-based classification (no Ollama → no timeouts), and `POST /api/cleaner/apply` receives paths and deletes them. The UI replaces the toggle/Examiner pattern with a summary banner + checklist + single confirm button.

**Tech Stack:** Python 3.11, FastAPI, pytest, vanilla JS, HTML/CSS

---

## File Map

| File | Change |
|------|--------|
| `tools/generate_document.py` | **Delete** |
| `tools/summarize_document.py` | **Delete** |
| `tools/prepare_hearing.py` | **Delete** |
| `tools/outlook_monitor.py` | **Delete** (unused after cleaner rewrite) |
| `workflows/draft_letter.md` | **Delete** |
| `workflows/summarize_document.md` | **Delete** |
| `workflows/prepare_hearing.md` | **Delete** |
| `agents/draft-letter/` | **Delete** |
| `agents/summarize-document/` | **Delete** |
| `agents/prepare-hearing/` | **Delete** |
| `tests/test_outlook_monitor.py` | **Delete** |
| `tests/test_cleaner_api.py` | **Delete** (tests old SSE/proposals API) |
| `prompts.py` | Remove letter, summary, hearing |
| `server.py` | Remove 3 agents; replace cleaner infrastructure |
| `tools/file_cleaner.py` | Replace Ollama classification with 3 rules + `scan_for_deletion()` |
| `tests/test_file_cleaner.py` | Rewrite for new classification |
| `tests/test_server.py` | Add 404 checks for removed routes; rewrite cleaner endpoint tests |
| `interface/index.html` | Remove 3 sidebar buttons + 3 sections; rewrite `#agent-cleaner` |
| `interface/app.js` | Remove 3 agent handlers; rewrite cleaner JS |
| `interface/style.css` | Add cleaner table styles |

---

## Task 1: Delete deprecated files

**Files:** All items marked **Delete** in the file map above.

- [ ] **Step 1: Delete deprecated tools, workflows, and agents**

```bash
cd "/Users/morganracon/Errol set of agent "
rm tools/generate_document.py tools/summarize_document.py tools/prepare_hearing.py tools/outlook_monitor.py
rm workflows/draft_letter.md workflows/summarize_document.md workflows/prepare_hearing.md
rm -r agents/draft-letter agents/summarize-document agents/prepare-hearing
rm tests/test_outlook_monitor.py tests/test_cleaner_api.py
```

- [ ] **Step 2: Verify tests still pass (54 → ~30 expected after deletions)**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/ -q --tb=short 2>&1 | tail -15
```

Expected: some failures due to server.py still importing `outlook_monitor` and `file_cleaner` — that's fine, Task 2 fixes it.

- [ ] **Step 3: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add -A
git commit -m "chore: delete deprecated agents (letter, summary, hearing) and outlook monitor"
```

---

## Task 2: Clean up prompts.py

**Files:**
- Modify: `prompts.py`
- Modify: `tests/test_prompts.py`

- [ ] **Step 1: Write failing tests**

Replace the contents of `tests/test_prompts.py` with:

```python
import pytest
from prompts import build_prompt, build_input_summary, AGENT_LABELS


def test_agent_labels_has_exactly_four_agents():
    assert set(AGENT_LABELS.keys()) == {"rag", "invoice", "content", "cleaner"}


def test_build_prompt_rag():
    prompt = build_prompt("rag", {"input": "Quelles obligations Dupont ?"})
    assert "Dupont" in prompt
    assert "français" in prompt


def test_build_prompt_invoice():
    body = {"fields": {"client": "ABC", "date": "01/01/2026", "hours": "3", "rate": "350", "description": "Conseil"}}
    prompt = build_prompt("invoice", body)
    assert "ABC" in prompt
    assert "1050.00" in prompt


def test_build_prompt_content_linkedin():
    prompt = build_prompt("content", {"input": "Sociétés à mission", "content_type": "linkedin"})
    assert "LinkedIn" in prompt
    assert "Errol Cohen" in prompt


def test_build_prompt_content_article():
    prompt = build_prompt("content", {"input": "Sujet test", "content_type": "article"})
    assert "article" in prompt.lower()


def test_build_prompt_raises_for_removed_agents():
    for agent in ("letter", "summary", "hearing"):
        with pytest.raises(ValueError):
            build_prompt(agent, {})


def test_build_input_summary_invoice():
    body = {"fields": {"description": "Conseil", "client": "ABC"}}
    assert build_input_summary("invoice", body) == "Conseil — ABC"


def test_build_input_summary_rag():
    assert build_input_summary("rag", {"input": "Question ?"}) == "Question ?"
```

- [ ] **Step 2: Run tests to see failures**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/test_prompts.py -v 2>&1 | tail -20
```

Expected: `test_agent_labels_has_exactly_four_agents` and `test_build_prompt_raises_for_removed_agents` FAIL.

- [ ] **Step 3: Rewrite prompts.py**

Replace the entire file with:

```python
AGENT_LABELS = {
    "rag":     "Interroger mes dossiers",
    "invoice": "Générer une facture",
    "content": "Créer du contenu",
    "cleaner": "Nettoyer mes fichiers",
}


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value or default)
    except (ValueError, TypeError):
        return default


def build_prompt(agent_id: str, body: dict) -> str:
    if agent_id == "rag":
        return (
            "Tu es l'assistant juridique du cabinet Le Play Avocats. "
            "Réponds en français à la question suivante en t'appuyant sur les documents disponibles. "
            "Cite les sources si possible.\n\n"
            f"Question : {body.get('input', '')}"
        )

    if agent_id == "invoice":
        f = body.get("fields", {})
        hours = _safe_float(f.get("hours", 0))
        rate = _safe_float(f.get("rate", 0))
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

    raise ValueError(f"Unknown agent_id: {agent_id!r}")


def build_input_summary(agent_id: str, body: dict) -> str:
    f = body.get("fields", {})
    if agent_id == "invoice":
        return f"{f.get('description', '')} — {f.get('client', '')}"
    return (body.get("input") or "")[:200]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/test_prompts.py -v 2>&1 | tail -15
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add prompts.py tests/test_prompts.py
git commit -m "feat: remove letter/summary/hearing from prompts, keep 4 agents"
```

---

## Task 3: Rewrite file_cleaner.py with rule-based classification

**Files:**
- Modify: `tools/file_cleaner.py`
- Modify: `tests/test_file_cleaner.py`

The new classification is entirely rule-based (no Ollama) — fast and reliable. Three rules cover the common cases: duplicates, screenshots, old files.

- [ ] **Step 1: Write failing tests**

Replace `tests/test_file_cleaner.py` with:

```python
import time
import pytest
from pathlib import Path
from tools.file_cleaner import scan_for_deletion, _classify_for_deletion, SUPPORTED_EXTENSIONS


def test_supported_extensions_include_expected_types():
    for ext in (".pdf", ".docx", ".doc", ".txt", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"):
        assert ext in SUPPORTED_EXTENSIONS


def test_classify_duplicate_by_parenthesis(tmp_path):
    f = tmp_path / "rapport (1).pdf"
    f.touch()
    reason = _classify_for_deletion(f)
    assert reason is not None
    assert "doublon" in reason.lower()


def test_classify_duplicate_by_v2(tmp_path):
    f = tmp_path / "contrat_v2.docx"
    f.touch()
    reason = _classify_for_deletion(f)
    assert reason is not None
    assert "doublon" in reason.lower()


def test_classify_duplicate_by_copie(tmp_path):
    f = tmp_path / "facture - copie.pdf"
    f.touch()
    reason = _classify_for_deletion(f)
    assert reason is not None


def test_classify_screenshot_by_name(tmp_path):
    f = tmp_path / "Capture d'écran 2023-04-08.png"
    f.touch()
    reason = _classify_for_deletion(f)
    assert reason is not None
    assert "capture" in reason.lower() or "screenshot" in reason.lower()


def test_classify_screenshot_keyword_screenshot(tmp_path):
    f = tmp_path / "Screenshot 2024-01-15.png"
    f.touch()
    reason = _classify_for_deletion(f)
    assert reason is not None


def test_classify_old_small_file(tmp_path):
    f = tmp_path / "note.txt"
    f.write_text("old note")
    old_time = time.time() - (400 * 24 * 3600)  # 400 days ago
    import os
    os.utime(str(f), (old_time, old_time))
    reason = _classify_for_deletion(f)
    assert reason is not None
    assert "mois" in reason


def test_classify_recent_normal_file_returns_none(tmp_path):
    f = tmp_path / "contrat_dupont.pdf"
    f.write_text("recent contract")
    reason = _classify_for_deletion(f)
    assert reason is None


def test_scan_for_deletion_returns_proposals_and_count(tmp_path):
    (tmp_path / "rapport (1).pdf").touch()
    (tmp_path / "Capture d'écran 2023.png").touch()
    (tmp_path / "contrat_normal.pdf").touch()

    proposals, total = scan_for_deletion([str(tmp_path)])

    assert total == 3
    assert len(proposals) == 2
    assert all("id" in p for p in proposals)
    assert all("path" in p for p in proposals)
    assert all("filename" in p for p in proposals)
    assert all("type" in p for p in proposals)
    assert all("reason" in p for p in proposals)
    assert all("size_bytes" in p for p in proposals)


def test_scan_for_deletion_skips_unsupported_extensions(tmp_path):
    (tmp_path / "file.xyz").touch()
    (tmp_path / "rapport (1).pdf").touch()
    proposals, total = scan_for_deletion([str(tmp_path)])
    assert total == 1  # only the PDF is scanned


def test_scan_for_deletion_skips_missing_folder():
    proposals, total = scan_for_deletion(["/nonexistent/path"])
    assert proposals == []
    assert total == 0


def test_scan_for_deletion_file_type_is_uppercase_ext(tmp_path):
    (tmp_path / "rapport (1).pdf").touch()
    proposals, _ = scan_for_deletion([str(tmp_path)])
    assert proposals[0]["type"] == "PDF"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/test_file_cleaner.py -v 2>&1 | tail -20
```

Expected: multiple FAIL (functions don't exist yet).

- [ ] **Step 3: Rewrite tools/file_cleaner.py**

Replace the entire file with:

```python
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

SUPPORTED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".xlsx", ".xls"
}

DUPLICATE_PATTERN = re.compile(
    r'(\s*\(\d+\)|\s*[-_]v\d+|\s*[-_]copie|\s*[-_]final|\s*[-_]old|\s*[-_]backup)',
    re.IGNORECASE,
)

SCREENSHOT_KEYWORDS = [
    "capture d'écran", "capture_d_ecran", "screenshot", "screen shot",
    "screen_shot", "img_", "image001",
]

_OLD_FILE_DAYS = 365
_OLD_FILE_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def _classify_for_deletion(file_path: Path) -> Optional[str]:
    """Returns a reason string if the file should be proposed for deletion, else None."""
    name_lower = file_path.name.lower()
    stem = file_path.stem

    # Rule 1: duplicates
    if DUPLICATE_PATTERN.search(stem):
        return "Doublon probable"

    # Rule 2: screenshots
    if any(kw in name_lower for kw in SCREENSHOT_KEYWORDS):
        return "Capture d'écran sans usage identifié"

    # Rule 3: old and small files
    stat = file_path.stat()
    age_days = (datetime.now() - datetime.fromtimestamp(stat.st_mtime)).days
    if age_days > _OLD_FILE_DAYS and stat.st_size < _OLD_FILE_MAX_BYTES:
        months = age_days // 30
        return f"Non modifié depuis {months} mois"

    return None


def scan_for_deletion(folders: list) -> tuple:
    """
    Scans folders and returns (proposals, total_scanned).
    proposals: list of {id, path, filename, type, reason, size_bytes}
    No Ollama calls — rule-based only for speed and reliability.
    """
    proposals = []
    total_scanned = 0

    for folder in folders:
        p = Path(folder).expanduser()
        if not p.exists():
            continue
        for f in p.iterdir():
            if not f.is_file() or f.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            total_scanned += 1
            reason = _classify_for_deletion(f)
            if reason:
                proposals.append({
                    "id": uuid.uuid4().hex,
                    "path": str(f),
                    "filename": f.name,
                    "type": f.suffix.lstrip(".").upper(),
                    "reason": reason,
                    "size_bytes": f.stat().st_size,
                })

    return proposals, total_scanned
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/test_file_cleaner.py -v 2>&1 | tail -20
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add tools/file_cleaner.py tests/test_file_cleaner.py
git commit -m "feat: replace Ollama classification with 3-rule engine in file cleaner"
```

---

## Task 4: Rewrite cleaner endpoints in server.py

**Files:**
- Modify: `server.py`
- Modify: `tests/test_server.py`

Remove SSE, scheduler, run_scan, proposals persistence. Add synchronous scan endpoint.

- [ ] **Step 1: Write failing tests**

Add to the end of `tests/test_server.py`:

```python
def test_removed_agents_return_404():
    for route in ("/api/cleaner/proposals", "/api/cleaner/events"):
        r = client.get(route)
        assert r.status_code == 404, f"Expected 404 for {route}, got {r.status_code}"


def test_cleaner_scan_returns_proposals(monkeypatch):
    monkeypatch.setattr(
        "server.file_cleaner.scan_for_deletion",
        lambda folders: ([
            {"id": "abc", "path": "/tmp/file.pdf", "filename": "file.pdf",
             "type": "PDF", "reason": "Doublon probable", "size_bytes": 1024}
        ], 5)
    )
    monkeypatch.setattr("server.get_cleaner_settings", lambda: {"folders": ["/tmp"]})
    r = client.post("/api/cleaner/scan")
    assert r.status_code == 200
    data = r.json()
    assert "proposals" in data
    assert "total_scanned" in data
    assert "total_size_bytes" in data
    assert data["total_scanned"] == 5
    assert len(data["proposals"]) == 1
    assert data["proposals"][0]["type"] == "PDF"


def test_cleaner_apply_deletes_files(tmp_path):
    f = tmp_path / "old.pdf"
    f.write_text("content")
    r = client.post("/api/cleaner/apply", json={"paths": [str(f)]})
    assert r.status_code == 200
    data = r.json()
    assert str(f) in data["deleted"]
    assert not f.exists()


def test_cleaner_apply_handles_missing_file(tmp_path):
    missing = str(tmp_path / "gone.pdf")
    r = client.post("/api/cleaner/apply", json={"paths": [missing]})
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"] == []
    assert len(data["errors"]) == 1
    assert "gone.pdf" in data["errors"][0]["path"]
```

- [ ] **Step 2: Run tests to see the failures**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/test_server.py -v 2>&1 | tail -20
```

Expected: the 4 new tests FAIL (routes don't exist yet in new form, old tests may also fail due to import of outlook_monitor).

- [ ] **Step 3: Rewrite server.py**

Replace the full contents of `server.py` with the following. Key changes: remove APScheduler, SSE, run_scan, broadcast_sse, outlook_monitor import, proposals file, and the 3 deprecated agent routes. Replace cleaner endpoints.

```python
import asyncio
import io
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Optional

import httpx
from docx import Document
from docx.shared import Pt, RGBColor
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pypdf import PdfReader

from dotenv import load_dotenv
load_dotenv()

import tools.file_cleaner as file_cleaner
from prompts import build_prompt, build_input_summary, AGENT_LABELS

_history_lock = asyncio.Lock()

# ─── Config ───────────────────────────────────────────────────────────────────

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

DATA_DIR = Path("data")
HISTORY_FILE = DATA_DIR / "history.json"
TEMPLATES_FILE = DATA_DIR / "templates.json"
FEEDBACK_FILE = DATA_DIR / "feedback.json"
CLEANER_SETTINGS_FILE = DATA_DIR / "cleaner_settings.json"


@asynccontextmanager
async def lifespan(app_: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)

# ─── JSON helpers ─────────────────────────────────────────────────────────────

def read_json(path: Path) -> list:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: list) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ─── Cleaner helpers ──────────────────────────────────────────────────────────

def get_cleaner_settings() -> dict:
    defaults = {
        "folders": os.getenv(
            "CLEANER_FOLDERS",
            f"{Path.home()}/Desktop,{Path.home()}/Downloads"
        ).split(","),
    }
    if CLEANER_SETTINGS_FILE.exists():
        saved = json.loads(CLEANER_SETTINGS_FILE.read_text(encoding="utf-8"))
        defaults.update(saved)
    return defaults


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

# ─── File upload & text extraction ───────────────────────────────────────────

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    content_type = file.content_type or ""
    file_bytes = await file.read()

    is_pdf  = "pdf" in content_type or filename.lower().endswith(".pdf")
    is_docx = "wordprocessingml" in content_type or filename.lower().endswith(".docx")
    is_doc  = filename.lower().endswith(".doc")
    is_text = "text" in content_type or filename.lower().endswith(".txt")

    if is_pdf:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages  = [page.extract_text() or "" for page in reader.pages]
        text   = "\n\n".join(p for p in pages if p.strip())
    elif is_docx:
        doc  = Document(io.BytesIO(file_bytes))
        text = "\n".join(para.text for para in doc.paragraphs)
    elif is_text:
        text = file_bytes.decode("utf-8", errors="replace")
    elif is_doc:
        raise HTTPException(
            status_code=415,
            detail="Le format .doc (ancien Word) n'est pas supporté. Veuillez enregistrer le fichier en .docx et réessayer.",
        )
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Format non supporté : {filename}. Formats acceptés : PDF, DOCX, TXT.",
        )

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="Aucun texte n'a pu être extrait du document. Il est peut-être scanné ou protégé.",
        )

    return {"text": text, "filename": filename}

# ─── Generate (Ollama proxy + streaming + auto-save to history) ───────────────

@app.post("/api/generate")
async def generate(request: Request):
    body = await request.json()
    agent_id = body.get("agent")
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent is required")

    try:
        prompt = build_prompt(agent_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    async def stream_and_save() -> AsyncGenerator[bytes, None]:
        full_output: list[str] = []
        try:
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
        except Exception as e:
            error_line = json.dumps({"error": True, "message": str(e)})
            yield (error_line + "\n").encode()
        finally:
            output_text = "".join(full_output)
            if output_text:
                async with _history_lock:
                    history = read_json(HISTORY_FILE)
                    history.insert(0, {
                        "id": str(uuid.uuid4()),
                        "agent": agent_id,
                        "agent_label": AGENT_LABELS.get(agent_id, agent_id),
                        "input": build_input_summary(agent_id, body),
                        "fields": body.get("fields"),
                        "output": output_text,
                        "created_at": datetime.now().isoformat(),
                    })
                    write_json(HISTORY_FILE, history)

    return StreamingResponse(stream_and_save(), media_type="text/plain")

# ─── History ──────────────────────────────────────────────────────────────────

@app.get("/api/history")
def get_history(agent: Optional[str] = None, limit: int = 20):
    history = read_json(HISTORY_FILE)
    if agent:
        history = [h for h in history if h["agent"] == agent]
    return history[:limit]


@app.delete("/api/history/{entry_id}", status_code=204)
async def delete_history_entry(entry_id: str):
    async with _history_lock:
        history = read_json(HISTORY_FILE)
        updated = [h for h in history if h["id"] != entry_id]
        if len(updated) == len(history):
            raise HTTPException(status_code=404, detail="History entry not found")
        write_json(HISTORY_FILE, updated)


@app.delete("/api/history", status_code=204)
async def clear_history():
    async with _history_lock:
        write_json(HISTORY_FILE, [])

# ─── Templates ────────────────────────────────────────────────────────────────

@app.get("/api/templates")
def get_templates(agent: Optional[str] = None):
    templates = read_json(TEMPLATES_FILE)
    if agent:
        templates = [t for t in templates if t["agent"] == agent]
    return templates


@app.post("/api/templates", status_code=201)
async def create_template(request: Request):
    body = await request.json()
    agent  = body.get("agent", "").strip()
    label  = body.get("label", "").strip()
    prompt = body.get("prompt", "").strip()
    if not agent or not label or not prompt:
        raise HTTPException(status_code=400, detail="agent, label and prompt are required")
    templates = read_json(TEMPLATES_FILE)
    entry = {
        "id":         str(uuid.uuid4()),
        "agent":      agent,
        "label":      label,
        "prompt":     prompt,
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

# ─── Feedback ─────────────────────────────────────────────────────────────────

@app.post("/api/feedback", status_code=201)
async def post_feedback(request: Request):
    body   = await request.json()
    agent  = body.get("agent", "").strip()
    rating = body.get("rating", "").strip()
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

# ─── Export ───────────────────────────────────────────────────────────────────

AGENT_LABELS_SHORT = {
    "rag":     "Consultation dossiers",
    "invoice": "Facture",
    "content": "Contenu",
}


def _make_docx(content: str, agent: str) -> bytes:
    doc = Document()
    heading = doc.add_heading("Le Play Avocats", level=1)
    heading.runs[0].font.color.rgb = RGBColor(0x0D, 0x0D, 0x0D)
    meta = doc.add_paragraph(
        f"{AGENT_LABELS_SHORT.get(agent, agent)}  —  {datetime.now().strftime('%d/%m/%Y')}"
    )
    meta.runs[0].font.size = Pt(10)
    doc.add_paragraph("─" * 60)
    for line in content.split("\n"):
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_pdf(content: str, agent: str) -> bytes:
    buf = io.BytesIO()
    doc_pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2.5*cm, rightMargin=2.5*cm,
        topMargin=2.5*cm,  bottomMargin=2.5*cm,
    )
    styles     = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading1"], fontSize=16, spaceAfter=4)
    meta_style  = ParagraphStyle("meta",  parent=styles["Normal"],  fontSize=9,
                                 textColor=(0.4, 0.4, 0.4), spaceAfter=12)
    body_style  = ParagraphStyle("body",  parent=styles["Normal"],  fontSize=11, leading=16)

    story = [
        Paragraph("Le Play Avocats", title_style),
        Paragraph(
            f"{AGENT_LABELS_SHORT.get(agent, agent)} &mdash; {datetime.now().strftime('%d/%m/%Y')}",
            meta_style,
        ),
        Spacer(1, 0.3*cm),
    ]
    for line in content.split("\n"):
        safe_line = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        story.append(Paragraph(safe_line or "&nbsp;", body_style))
    doc_pdf.build(story)
    return buf.getvalue()


@app.post("/api/export")
async def export_document(request: Request):
    body    = await request.json()
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

# ─── Cleaner ──────────────────────────────────────────────────────────────────

@app.post("/api/cleaner/scan")
async def cleaner_scan():
    settings = get_cleaner_settings()
    proposals, total_scanned = file_cleaner.scan_for_deletion(settings["folders"])
    total_size_bytes = sum(p["size_bytes"] for p in proposals)
    return {
        "proposals": proposals,
        "total_scanned": total_scanned,
        "total_size_bytes": total_size_bytes,
    }


@app.post("/api/cleaner/apply")
async def cleaner_apply(request: Request):
    body = await request.json()
    paths = body.get("paths", [])
    deleted, errors = [], []
    for path_str in paths:
        try:
            Path(path_str).unlink()
            deleted.append(path_str)
        except FileNotFoundError:
            errors.append({"path": path_str, "error": "Fichier introuvable"})
        except Exception as e:
            errors.append({"path": path_str, "error": str(e)})
    return {"deleted": deleted, "errors": errors}


@app.get("/api/cleaner/settings")
async def get_settings():
    return get_cleaner_settings()


@app.post("/api/cleaner/settings")
async def update_settings(request: Request):
    body = await request.json()
    settings = get_cleaner_settings()
    if "folders" in body:
        settings["folders"] = body["folders"]
    CLEANER_SETTINGS_FILE.write_text(
        json.dumps(settings, ensure_ascii=False), encoding="utf-8"
    )
    return settings


# ─── Static files (must come last so /api routes are matched first) ───────────

app.mount("/", StaticFiles(directory="interface", html=True), name="static")
```

- [ ] **Step 4: Run all tests**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/ -q --tb=short 2>&1 | tail -20
```

Expected: all tests pass. Note: `test_get_history_filters_by_agent` uses `"letter"` as data — that test will still pass since it's filtering history data, not calling a route.

- [ ] **Step 5: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add server.py tests/test_server.py
git commit -m "feat: replace cleaner endpoints with sync scan/apply; remove SSE and scheduler"
```

---

## Task 5: Redesign cleaner section in index.html

**Files:**
- Modify: `interface/index.html`

- [ ] **Step 1: Remove the 3 deprecated sidebar buttons**

In `interface/index.html`, find and delete the three `<button>` elements with `data-agent="letter"`, `data-agent="summary"`, and `data-agent="hearing"` (lines ~42–57). The sidebar should only show: dashboard, rag, invoice, content, then the divider and cleaner.

The sidebar nav should look like:

```html
        <button class="agent-btn active" data-agent="dashboard" id="btn-dashboard">
          <svg viewBox="0 0 24 24" class="agent-icon" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          Tableau de bord
        </button>
        <div class="nav-divider"></div>
        <p class="nav-label">Agents</p>

        <button class="agent-btn" data-agent="rag">
          <svg viewBox="0 0 24 24" class="agent-icon" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><circle cx="11" cy="13" r="2.5"/><path d="m14.5 16.5 2 2"/></svg>
          Interroger mes dossiers
        </button>
        <button class="agent-btn" data-agent="invoice">
          <svg viewBox="0 0 24 24" class="agent-icon" aria-hidden="true"><path d="M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-2 2V3a1 1 0 0 1 1-1z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>
          Générer une facture
        </button>
        <button class="agent-btn" data-agent="content">
          <svg viewBox="0 0 24 24" class="agent-icon" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Créer du contenu
        </button>
        <div class="nav-divider"></div>
        <p class="nav-label">Organisation</p>
        <button class="agent-btn" data-agent="cleaner" id="btn-cleaner">
          <svg viewBox="0 0 24 24" class="agent-icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          Nettoyer mes fichiers
          <span class="cleaner-badge" id="cleaner-badge" style="display:none"></span>
        </button>
```

- [ ] **Step 2: Remove the 3 deprecated agent sections**

Delete the full `<section>` blocks for `id="agent-letter"`, `id="agent-summary"`, and `id="agent-hearing"` (roughly lines 139–336).

- [ ] **Step 3: Replace the cleaner section**

Find the `<section class="agent-view" id="agent-cleaner">` block and replace it entirely with:

```html
      <!-- Agent: Nettoyer mes fichiers -->
      <section class="agent-view" id="agent-cleaner">
        <p class="agent-section-label">Organisation</p>
        <h1 class="agent-title">Nettoyer mes fichiers</h1>
        <p class="agent-desc">L'IA analyse votre Bureau et vos Téléchargements et vous propose les fichiers à supprimer. Rien ne se supprime sans votre validation.</p>

        <div class="cleaner-scan-bar">
          <button class="btn-primary" id="cleaner-scan-btn" onclick="cleanerScan()">Scanner maintenant</button>
          <span class="cleaner-scanning" id="cleaner-scanning" style="display:none">Analyse en cours…</span>
        </div>

        <!-- Summary banner (shown after scan) -->
        <div class="cleaner-banner" id="cleaner-banner" style="display:none">
          <div class="cleaner-banner-left">
            <div class="cleaner-count" id="cleaner-count">0</div>
            <div>
              <div class="cleaner-banner-title">fichiers à supprimer</div>
              <div class="cleaner-banner-sub">Décochez pour exclure un fichier</div>
            </div>
            <div class="cleaner-stats">
              <div class="cleaner-stat">
                <div class="cleaner-stat-num" id="cleaner-stat-total">0</div>
                <div class="cleaner-stat-label">scannés</div>
              </div>
              <div class="cleaner-stat">
                <div class="cleaner-stat-num" id="cleaner-stat-size">0</div>
                <div class="cleaner-stat-label">récupérés</div>
              </div>
            </div>
          </div>
          <button class="btn-danger" id="cleaner-confirm-top" onclick="cleanerConfirm()">
            Supprimer les <span id="cleaner-sel-count-top">0</span> fichiers sélectionnés
          </button>
        </div>

        <!-- Proposals table -->
        <div id="cleaner-list" style="display:none"></div>

        <!-- Empty state -->
        <div class="cleaner-empty-state" id="cleaner-empty" style="display:none">
          Aucun fichier à nettoyer. Bureau et Téléchargements sont propres.
        </div>

        <!-- Bottom confirm -->
        <div class="cleaner-footer" id="cleaner-footer" style="display:none">
          <span class="cleaner-safe-note">✓ Rien ne se supprime sans votre validation</span>
          <button class="btn-danger" onclick="cleanerConfirm()">
            Confirmer la suppression (<span id="cleaner-sel-count-bottom">0</span> fichiers)
          </button>
        </div>
      </section>
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add interface/index.html
git commit -m "feat: remove 3 deprecated agent sections; redesign cleaner HTML"
```

---

## Task 6: Rewrite cleaner JavaScript in app.js

**Files:**
- Modify: `interface/app.js`

- [ ] **Step 1: Remove deprecated agent code**

In `interface/app.js`, find and delete all code related to `letter`, `summary`, and `hearing` agents. This includes:
- Any `runAgent('letter')`, `runAgent('summary')`, `runAgent('hearing')` handler logic
- Any references to `letter-recipient`, `letter-type`, `letter-subject`, `letter-facts`, `summary-input`, `summary-file`, `summary-drop`, `hearing-case`, `hearing-date`, `hearing-parties`, `hearing-arguments` DOM elements in the agent runner

The `runAgent()` function collects fields based on `agent_id`. Remove the three cases for letter, summary, hearing from within that function.

- [ ] **Step 2: Remove old cleaner code and replace**

Find all functions and variables prefixed with `cleaner` in `app.js` (from the top declarations: `cleanerEventSource`, `cleanerBadgeCount`, `cleanerProposals`, `cleanerSelected`, and all functions `cleanerUpdateBadge`, `cleanerInitSSE`, `cleanerLoadProposals`, etc.) and replace them entirely with:

```javascript
// ─── Cleaner ──────────────────────────────────────────────────────────────────

let _cleanerProposals = [];
let _cleanerTotalScanned = 0;
let _cleanerTotalSize = 0;

async function cleanerScan() {
  const btn = document.getElementById('cleaner-scan-btn');
  const spinner = document.getElementById('cleaner-scanning');
  btn.disabled = true;
  spinner.style.display = 'inline';
  document.getElementById('cleaner-banner').style.display = 'none';
  document.getElementById('cleaner-list').style.display = 'none';
  document.getElementById('cleaner-empty').style.display = 'none';
  document.getElementById('cleaner-footer').style.display = 'none';

  try {
    const r = await fetch('/api/cleaner/scan', { method: 'POST' });
    const data = await r.json();
    _cleanerProposals = data.proposals.map(p => ({ ...p, selected: true }));
    _cleanerTotalScanned = data.total_scanned;
    _cleanerTotalSize = data.total_size_bytes;
    cleanerRender();
  } catch (e) {
    console.error('Scan error', e);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

function cleanerRender() {
  const selected = _cleanerProposals.filter(p => p.selected);
  const count = selected.length;

  document.getElementById('cleaner-count').textContent = count;
  document.getElementById('cleaner-stat-total').textContent = _cleanerTotalScanned;
  document.getElementById('cleaner-stat-size').textContent = cleanerFormatBytes(_cleanerTotalSize);
  document.getElementById('cleaner-sel-count-top').textContent = count;
  document.getElementById('cleaner-sel-count-bottom').textContent = count;

  if (_cleanerProposals.length === 0) {
    document.getElementById('cleaner-empty').style.display = 'block';
    document.getElementById('cleaner-banner').style.display = 'none';
    document.getElementById('cleaner-list').style.display = 'none';
    document.getElementById('cleaner-footer').style.display = 'none';
    return;
  }

  document.getElementById('cleaner-banner').style.display = 'flex';
  document.getElementById('cleaner-list').style.display = 'block';
  document.getElementById('cleaner-footer').style.display = 'flex';
  document.getElementById('cleaner-empty').style.display = 'none';

  const list = document.getElementById('cleaner-list');
  list.innerHTML = _cleanerProposals.map((p, i) => {
    const ext = p.type.toLowerCase();
    const badgeClass = ['pdf','docx','doc'].includes(ext) ? 'badge-blue'
                     : ['png','jpg','jpeg'].includes(ext) ? 'badge-green'
                     : 'badge-grey';
    return `
      <div class="cleaner-row${p.selected ? '' : ' cleaner-row-unchecked'}" id="cleaner-row-${i}">
        <div class="cleaner-check${p.selected ? ' checked' : ''}" onclick="cleanerToggle(${i})">
          ${p.selected ? '✓' : ''}
        </div>
        <span class="file-type-badge ${badgeClass}">${escapeHtml(p.type)}</span>
        <div class="cleaner-file-info">
          <div class="cleaner-filename${p.selected ? '' : ' cleaner-filename-struck'}">${escapeHtml(p.filename)}</div>
          <div class="cleaner-path">${escapeHtml(p.path)}</div>
        </div>
        <div class="cleaner-reason">${escapeHtml(p.reason)}</div>
        <div class="cleaner-size">${cleanerFormatBytes(p.size_bytes)}</div>
      </div>`;
  }).join('');
}

function cleanerToggle(i) {
  _cleanerProposals[i].selected = !_cleanerProposals[i].selected;
  cleanerRender();
}

async function cleanerConfirm() {
  const paths = _cleanerProposals.filter(p => p.selected).map(p => p.path);
  if (paths.length === 0) return;

  const r = await fetch('/api/cleaner/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });
  const result = await r.json();

  const deletedSet = new Set(result.deleted);
  _cleanerProposals = _cleanerProposals.filter(p => !deletedSet.has(p.path));
  _cleanerTotalSize -= result.deleted.reduce((acc, path) => {
    const p = _cleanerProposals.find(x => x.path === path);
    return acc + (p ? p.size_bytes : 0);
  }, 0);
  cleanerRender();

  const msg = result.errors.length > 0
    ? `${result.deleted.length} supprimé(s). ${result.errors.length} introuvable(s).`
    : `${result.deleted.length} fichier(s) supprimé(s) avec succès.`;
  cleanerShowToast(msg);
}

function cleanerShowToast(msg) {
  let toast = document.getElementById('cleaner-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cleaner-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0D0D0D;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;transition:opacity 0.3s;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

function cleanerFormatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
```

- [ ] **Step 3: Also remove cleanerInitSSE() call**

Search for any call to `cleanerInitSSE()` in the file (typically in a DOMContentLoaded listener or init function) and remove it.

- [ ] **Step 4: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add interface/app.js
git commit -m "feat: rewrite cleaner JS — sync scan, checklist, one-click confirm"
```

---

## Task 7: Add cleaner CSS styles

**Files:**
- Modify: `interface/style.css`

- [ ] **Step 1: Add cleaner styles at the end of style.css**

Append these styles to the end of `interface/style.css`:

```css
/* ─── Cleaner ─────────────────────────────────────────────────────── */

.cleaner-scan-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.cleaner-scanning {
  font-size: 13px;
  color: #888;
}

/* Summary banner */
.cleaner-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  padding: 18px 24px;
  margin-bottom: 12px;
}

.cleaner-banner-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cleaner-count {
  font-size: 36px;
  font-weight: 800;
  color: #e53e3e;
  line-height: 1;
}

.cleaner-banner-title {
  font-size: 15px;
  font-weight: 700;
  color: #0D0D0D;
}

.cleaner-banner-sub {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}

.cleaner-stats {
  display: flex;
  gap: 20px;
  padding-left: 20px;
  border-left: 1px solid #f0f0f0;
}

.cleaner-stat {
  text-align: center;
}

.cleaner-stat-num {
  font-size: 16px;
  font-weight: 700;
  color: #0D0D0D;
}

.cleaner-stat-label {
  font-size: 9px;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Table rows */
.cleaner-row {
  display: grid;
  grid-template-columns: 28px 56px 1fr 160px 70px;
  align-items: center;
  gap: 0;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 6px;
  transition: opacity 0.15s;
}

.cleaner-row-unchecked {
  opacity: 0.4;
}

.cleaner-check {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: #e53e3e;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.cleaner-check:not(.checked) {
  background: #fff;
  border: 2px solid #ddd;
}

.cleaner-file-info {
  min-width: 0;
}

.cleaner-filename {
  font-size: 12px;
  font-weight: 600;
  color: #0D0D0D;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cleaner-filename-struck {
  text-decoration: line-through;
}

.cleaner-path {
  font-size: 10px;
  color: #aaa;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cleaner-reason {
  font-size: 11px;
  color: #666;
}

.cleaner-size {
  font-size: 10px;
  color: #bbb;
  text-align: right;
}

/* Footer */
.cleaner-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-top: 1px solid #f0f0f0;
  margin-top: 16px;
}

.cleaner-safe-note {
  font-size: 11px;
  color: #22aa44;
  font-weight: 600;
}

.cleaner-empty-state {
  padding: 32px;
  text-align: center;
  color: #888;
  font-size: 13px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px dashed #e0e0e0;
  margin-top: 12px;
}

/* Danger button */
.btn-danger {
  background: #e53e3e;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.btn-danger:hover {
  background: #c53030;
}

/* Badge colours for cleaner */
.badge-blue  { background: #ebf4ff; color: #2b6cb0; }
.badge-green { background: #f0fff4; color: #276749; }
.badge-grey  { background: #f7f7f7; color: #666; }
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add interface/style.css
git commit -m "feat: add cleaner table CSS (banner, checklist rows, danger button)"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests pass, no errors.

- [ ] **Step 2: Start the server and verify in browser**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m uvicorn server:app --port 3000 --reload
```

Open http://localhost:3000 and verify:
- Sidebar shows: Tableau de bord, Interroger mes dossiers, Générer une facture, Créer du contenu, Nettoyer mes fichiers — nothing else
- Clicking "Scanner maintenant" triggers a scan (button disables, spinner appears)
- After scan: banner shows count + stats, list shows files with reasons, confirm button works
- Unchecking a row grays it out and decrements the counter

- [ ] **Step 3: Final commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add -A
git commit -m "feat: complete remake — 4 agents, rule-based cleaner with one-click validation"
```
