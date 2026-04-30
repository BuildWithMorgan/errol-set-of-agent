# File Cleaner Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7th agent "Nettoyer mes fichiers" that continuously scans Downloads/Desktop for files to organise, monitors Outlook for attachment emails, generates proposals, and notifies Errol via SSE — nothing moves without explicit approval.

**Architecture:** APScheduler runs a background scan thread inside the FastAPI server; findings are written to `data/cleaner_proposals.json` and pushed to connected browsers via Server-Sent Events. The frontend renders proposals as toggleable triage cards; a POST to `/api/cleaner/apply` executes only the approved ones.

**Tech Stack:** APScheduler 3.x, FastAPI SSE (StreamingResponse), browser Notification API, Microsoft Graph API (optional/deferred), httpx (already installed), pytest + monkeypatch for tests.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `tools/file_cleaner.py` | Scan folders, classify files via Ollama, return proposals |
| Create | `tools/outlook_monitor.py` | Poll Outlook via Graph API, return email proposals |
| Modify | `server.py` | Add APScheduler, SSE infrastructure, 6 new endpoints, lifespan |
| Modify | `requirements.txt` | Add APScheduler |
| Modify | `interface/index.html` | Sidebar button with badge, `#agent-cleaner` section |
| Modify | `interface/app.js` | SSE listener, proposal rendering, apply handler, notifications |
| Create | `workflows/file_cleaner.md` | Workflow SOP |
| Create | `tests/test_file_cleaner.py` | Unit tests for scanner |
| Create | `tests/test_outlook_monitor.py` | Unit tests for email monitor |
| Create | `tests/test_cleaner_api.py` | Integration tests for API endpoints |

---

## Task 1: Add APScheduler dependency

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add APScheduler to requirements**

Open `requirements.txt` and add:
```
APScheduler==3.10.4
```

- [ ] **Step 2: Install it**

```bash
pip install APScheduler==3.10.4
```

Expected: `Successfully installed APScheduler-3.10.4`

- [ ] **Step 3: Verify import works**

```bash
python -c "from apscheduler.schedulers.background import BackgroundScheduler; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add requirements.txt
git commit -m "chore: add APScheduler dependency for file cleaner agent"
```

---

## Task 2: File scanner tool

**Files:**
- Create: `tools/file_cleaner.py`
- Create: `tests/test_file_cleaner.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_file_cleaner.py`:

```python
import json
import pytest
from pathlib import Path
from unittest.mock import patch
from tools.file_cleaner import get_files_to_scan, classify_file, scan_folders

MOCK_CLASSIFICATION = {
    "client": "Dupont",
    "document_type": "contrat",
    "legal_value": True,
    "proposed_name": "2026-04-30_Dupont_contrat.pdf",
    "proposed_subfolder": "Clients/Dupont",
    "reason": "Contrat Dupont détecté",
    "action": "rename_and_move"
}

MOCK_SCREENSHOT_CLASSIFICATION = {
    "client": None,
    "document_type": "capture_ecran",
    "legal_value": False,
    "proposed_name": "Capture d'écran 2026-04-28.png",
    "proposed_subfolder": "Divers",
    "reason": "Capture d'écran sans valeur juridique",
    "action": "delete"
}


def test_get_files_to_scan_returns_recent_files(tmp_path):
    (tmp_path / "contrat.pdf").touch()
    (tmp_path / "note.txt").touch()
    (tmp_path / "ignored.xyz").touch()
    files = get_files_to_scan([str(tmp_path)], max_age_days=30)
    names = [f.name for f in files]
    assert "contrat.pdf" in names
    assert "note.txt" in names
    assert "ignored.xyz" not in names


def test_get_files_to_scan_skips_missing_folder():
    files = get_files_to_scan(["/nonexistent/path"], max_age_days=30)
    assert files == []


def test_scan_folders_returns_proposals(tmp_path, monkeypatch):
    (tmp_path / "contrat_dupont.pdf").touch()
    monkeypatch.setattr("tools.file_cleaner.classify_file", lambda p: MOCK_CLASSIFICATION)
    proposals = scan_folders([str(tmp_path)], max_age_days=30)
    assert len(proposals) == 1
    p = proposals[0]
    assert p["source"] == "file"
    assert p["status"] == "pending"
    assert p["action"] == "rename_and_move"
    assert "id" in p
    assert "detected_at" in p


def test_scan_folders_skips_known_paths(tmp_path, monkeypatch):
    f = tmp_path / "contrat.pdf"
    f.touch()
    monkeypatch.setattr("tools.file_cleaner.classify_file", lambda p: MOCK_CLASSIFICATION)
    proposals = scan_folders([str(tmp_path)], known_paths={str(f)})
    assert proposals == []


def test_scan_folders_delete_action(tmp_path, monkeypatch):
    (tmp_path / "screenshot.png").touch()
    monkeypatch.setattr("tools.file_cleaner.classify_file", lambda p: MOCK_SCREENSHOT_CLASSIFICATION)
    proposals = scan_folders([str(tmp_path)])
    assert proposals[0]["action"] == "delete"


def test_classify_file_falls_back_on_ollama_error(tmp_path, monkeypatch):
    import httpx
    def raise_error(*a, **kw):
        raise httpx.ConnectError("offline")
    monkeypatch.setattr("httpx.post", raise_error)
    f = tmp_path / "test.pdf"
    f.touch()
    result = classify_file(f)
    assert result["action"] == "review_manually"
    assert "Erreur" in result["reason"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_file_cleaner.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'tools.file_cleaner'`

- [ ] **Step 3: Create `tools/file_cleaner.py`**

```python
import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import httpx

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

SUPPORTED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".xlsx", ".xls"
}


def get_files_to_scan(folders: list, max_age_days: int = 30) -> list:
    cutoff = datetime.now() - timedelta(days=max_age_days)
    files = []
    for folder in folders:
        p = Path(folder).expanduser()
        if not p.exists():
            continue
        for f in p.iterdir():
            if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS:
                if datetime.fromtimestamp(f.stat().st_mtime) > cutoff:
                    files.append(f)
    return files


def classify_file(file_path: Path) -> dict:
    prompt = f"""Tu es un assistant de gestion documentaire pour un cabinet d'avocats français.
Analyse ce nom de fichier et génère une proposition de classement.

Nom du fichier : {file_path.name}
Dossier actuel : {file_path.parent.name}

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après :
{{
  "client": "nom du client ou null si inconnu",
  "document_type": "contrat|facture|jugement|courrier|capture_ecran|inconnu",
  "legal_value": true,
  "proposed_name": "YYYY-MM-DD_Client_Type.ext",
  "proposed_subfolder": "Clients/NomClient ou Divers",
  "reason": "explication courte en français",
  "action": "rename_and_move|delete|review_manually"
}}

Règles :
- Si le fichier est une capture d'écran ou un fichier temporaire : action = "delete"
- Si tu ne peux pas identifier le client : action = "review_manually"
- Sinon : action = "rename_and_move"
- proposed_name doit suivre le format YYYY-MM-DD_NomClient_Type.ext"""

    try:
        response = httpx.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=30.0,
        )
        response.raise_for_status()
        raw = response.json()["response"].strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        return json.loads(raw[start:end])
    except Exception as e:
        return {
            "client": None,
            "document_type": "inconnu",
            "legal_value": False,
            "proposed_name": file_path.name,
            "proposed_subfolder": "Divers",
            "reason": f"Erreur de classification : {e}",
            "action": "review_manually",
        }


def scan_folders(folders: list, max_age_days: int = 30, known_paths: set = None) -> list:
    if known_paths is None:
        known_paths = set()

    onedrive = os.getenv("ONEDRIVE_PATH", str(Path.home() / "OneDrive"))
    proposals = []

    for file_path in get_files_to_scan(folders, max_age_days):
        if str(file_path) in known_paths:
            continue
        classification = classify_file(file_path)
        destination = str(Path(onedrive) / classification["proposed_subfolder"])
        proposals.append({
            "id": uuid.uuid4().hex,
            "detected_at": datetime.now().isoformat(timespec="seconds"),
            "source": "file",
            "status": "pending",
            "original_path": str(file_path),
            "proposed_name": classification["proposed_name"],
            "proposed_destination": destination,
            "action": classification["action"],
            "ai_reason": classification["reason"],
        })

    return proposals
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_file_cleaner.py -v
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/file_cleaner.py tests/test_file_cleaner.py
git commit -m "feat: add file scanner tool with Ollama classification"
```

---

## Task 3: Outlook monitor tool

**Files:**
- Create: `tools/outlook_monitor.py`
- Create: `tests/test_outlook_monitor.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_outlook_monitor.py`:

```python
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone


def test_is_configured_false_when_no_env(monkeypatch):
    monkeypatch.delenv("OUTLOOK_CLIENT_ID", raising=False)
    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)
    assert m.is_configured() is False


def test_scan_emails_returns_empty_when_not_configured(monkeypatch):
    monkeypatch.delenv("OUTLOOK_CLIENT_ID", raising=False)
    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)
    result = m.scan_emails()
    assert result == []


def test_scan_emails_skips_known_ids(monkeypatch):
    monkeypatch.setenv("OUTLOOK_CLIENT_ID", "fake-id")
    monkeypatch.setenv("OUTLOOK_CLIENT_SECRET", "fake-secret")
    monkeypatch.setenv("OUTLOOK_TENANT_ID", "fake-tenant")
    monkeypatch.setenv("OUTLOOK_USER_EMAIL", "errol@example.com")

    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)

    fake_emails = [{"id": "known-id", "subject": "Test", "from": {"emailAddress": {"name": "Bob"}},
                    "receivedDateTime": "2026-04-30T10:00:00Z", "attachments": [{"name": "doc.pdf"}]}]

    with patch.object(m, "get_access_token", return_value="token"), \
         patch.object(m, "get_emails_with_attachments", return_value=[
             {"id": "known-id", "subject": "Test", "sender": "Bob",
              "received_at": "2026-04-30T10:00:00Z", "attachments": ["doc.pdf"]}
         ]):
        result = m.scan_emails(known_ids={"known-id"})
    assert result == []


def test_scan_emails_returns_proposals(monkeypatch):
    monkeypatch.setenv("OUTLOOK_CLIENT_ID", "fake-id")
    monkeypatch.setenv("OUTLOOK_CLIENT_SECRET", "fake-secret")
    monkeypatch.setenv("OUTLOOK_TENANT_ID", "fake-tenant")
    monkeypatch.setenv("OUTLOOK_USER_EMAIL", "errol@example.com")

    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)

    with patch.object(m, "get_access_token", return_value="token"), \
         patch.object(m, "get_emails_with_attachments", return_value=[
             {"id": "msg-1", "subject": "Projet d'acte", "sender": "Cabinet Lefebvre",
              "received_at": "2026-04-30T09:47:00Z", "attachments": ["acte.pdf", "annexe.docx"]}
         ]):
        result = m.scan_emails()

    assert len(result) == 1
    p = result[0]
    assert p["source"] == "email"
    assert p["action"] == "email_flag"
    assert p["status"] == "pending"
    assert "Cabinet Lefebvre" in p["ai_reason"]
    assert p["email_meta"]["attachments"] == ["acte.pdf", "annexe.docx"]


def test_scan_emails_fails_silently_on_error(monkeypatch):
    monkeypatch.setenv("OUTLOOK_CLIENT_ID", "fake-id")
    monkeypatch.setenv("OUTLOOK_CLIENT_SECRET", "fake-secret")
    monkeypatch.setenv("OUTLOOK_TENANT_ID", "fake-tenant")
    monkeypatch.setenv("OUTLOOK_USER_EMAIL", "errol@example.com")

    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)

    with patch.object(m, "get_access_token", side_effect=Exception("auth failed")):
        result = m.scan_emails()
    assert result == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_outlook_monitor.py -v 2>&1 | head -10
```

Expected: `ModuleNotFoundError: No module named 'tools.outlook_monitor'`

- [ ] **Step 3: Create `tools/outlook_monitor.py`**

```python
import os
import uuid
from datetime import datetime, timezone

import httpx

CLIENT_ID = os.getenv("OUTLOOK_CLIENT_ID")
CLIENT_SECRET = os.getenv("OUTLOOK_CLIENT_SECRET")
TENANT_ID = os.getenv("OUTLOOK_TENANT_ID")
USER_EMAIL = os.getenv("OUTLOOK_USER_EMAIL")


def is_configured() -> bool:
    return all([
        os.getenv("OUTLOOK_CLIENT_ID"),
        os.getenv("OUTLOOK_CLIENT_SECRET"),
        os.getenv("OUTLOOK_TENANT_ID"),
        os.getenv("OUTLOOK_USER_EMAIL"),
    ])


def get_access_token() -> str:
    tenant = os.getenv("OUTLOOK_TENANT_ID")
    resp = httpx.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={
            "grant_type": "client_credentials",
            "client_id": os.getenv("OUTLOOK_CLIENT_ID"),
            "client_secret": os.getenv("OUTLOOK_CLIENT_SECRET"),
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_emails_with_attachments(since: datetime = None) -> list:
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    filter_parts = ["hasAttachments eq true"]
    if since:
        ts = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        filter_parts.append(f"receivedDateTime ge {ts}")

    resp = httpx.get(
        f"https://graph.microsoft.com/v1.0/users/{os.getenv('OUTLOOK_USER_EMAIL')}/messages",
        headers=headers,
        params={
            "$filter": " and ".join(filter_parts),
            "$select": "id,subject,from,receivedDateTime,hasAttachments",
            "$expand": "attachments($select=name,size)",
            "$top": 20,
            "$orderby": "receivedDateTime desc",
        },
        timeout=15.0,
    )
    resp.raise_for_status()

    results = []
    for msg in resp.json().get("value", []):
        results.append({
            "id": msg["id"],
            "subject": msg["subject"],
            "sender": msg["from"]["emailAddress"]["name"],
            "received_at": msg["receivedDateTime"],
            "attachments": [a["name"] for a in msg.get("attachments", [])],
        })
    return results


def scan_emails(since: datetime = None, known_ids: set = None) -> list:
    if not is_configured():
        return []
    if known_ids is None:
        known_ids = set()

    try:
        emails = get_emails_with_attachments(since)
    except Exception:
        return []

    proposals = []
    for email in emails:
        if email["id"] in known_ids:
            continue
        attach_summary = ", ".join(email["attachments"][:3])
        count = len(email["attachments"])
        proposals.append({
            "id": uuid.uuid4().hex,
            "detected_at": datetime.now().isoformat(timespec="seconds"),
            "source": "email",
            "status": "pending",
            "original_path": email["id"],
            "proposed_name": None,
            "proposed_destination": None,
            "action": "email_flag",
            "ai_reason": f"{email['sender']} — {count} pièce(s) jointe(s) : {attach_summary}",
            "email_meta": {
                "subject": email["subject"],
                "sender": email["sender"],
                "received_at": email["received_at"],
                "attachments": email["attachments"],
            },
        })
    return proposals
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_outlook_monitor.py -v
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/outlook_monitor.py tests/test_outlook_monitor.py
git commit -m "feat: add Outlook monitor tool with graceful degradation"
```

---

## Task 4: Scheduler + SSE infrastructure in server.py

**Files:**
- Modify: `server.py` (top section: imports, globals, lifespan, broadcast helper)

- [ ] **Step 1: Add imports at the top of `server.py`**

After the existing imports block, add:

```python
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler

import tools.file_cleaner as file_cleaner
import tools.outlook_monitor as outlook_monitor
```

- [ ] **Step 2: Add SSE client registry and proposal store paths after the existing config block**

After `FEEDBACK_FILE = DATA_DIR / "feedback.json"`, add:

```python
CLEANER_PROPOSALS_FILE = DATA_DIR / "cleaner_proposals.json"
CLEANER_SETTINGS_FILE  = DATA_DIR / "cleaner_settings.json"

_sse_clients: set = set()
_sse_lock = asyncio.Lock()
_event_loop: asyncio.AbstractEventLoop = None

_scheduler = BackgroundScheduler()
_scan_running = False
```

- [ ] **Step 3: Add cleaner helper functions after the existing `write_json` function**

```python
def read_proposals() -> list:
    return read_json(CLEANER_PROPOSALS_FILE)


def write_proposals(data: list) -> None:
    write_json(CLEANER_PROPOSALS_FILE, data)


def get_cleaner_settings() -> dict:
    defaults = {
        "interval_minutes": int(os.getenv("CLEANER_INTERVAL_MINUTES", "60")),
        "folders": os.getenv(
            "CLEANER_FOLDERS",
            f"{Path.home()}/Downloads,{Path.home()}/Desktop"
        ).split(","),
        "max_age_days": int(os.getenv("CLEANER_MAX_FILE_AGE_DAYS", "30")),
        "outlook_enabled": outlook_monitor.is_configured(),
    }
    if CLEANER_SETTINGS_FILE.exists():
        saved = json.loads(CLEANER_SETTINGS_FILE.read_text(encoding="utf-8"))
        defaults.update(saved)
    return defaults


async def broadcast_sse(event: dict) -> None:
    async with _sse_lock:
        dead = set()
        for q in _sse_clients:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.add(q)
        _sse_clients.difference_update(dead)


def run_scan() -> None:
    global _scan_running
    if _scan_running:
        return
    _scan_running = True
    try:
        settings = get_cleaner_settings()
        proposals = read_proposals()
        known_paths = {p["original_path"] for p in proposals}

        new_proposals = file_cleaner.scan_folders(
            settings["folders"], settings["max_age_days"], known_paths
        )

        if settings.get("outlook_enabled"):
            email_proposals = [p for p in proposals if p["source"] == "email"]
            known_email_ids = {p["original_path"] for p in email_proposals}
            last_scan = None
            if email_proposals:
                from datetime import datetime as _dt
                last_scan = _dt.fromisoformat(email_proposals[-1]["detected_at"])
            new_proposals += outlook_monitor.scan_emails(last_scan, known_email_ids)

        if new_proposals:
            proposals.extend(new_proposals)
            write_proposals(proposals)

        if _event_loop:
            asyncio.run_coroutine_threadsafe(
                broadcast_sse({"type": "new_proposals", "count": len(new_proposals)}),
                _event_loop,
            )
            asyncio.run_coroutine_threadsafe(
                broadcast_sse({"type": "scan_complete", "found": len(new_proposals)}),
                _event_loop,
            )
    finally:
        _scan_running = False
```

- [ ] **Step 4: Replace `app = FastAPI()` with a lifespan-aware version**

Find the line `app = FastAPI()` and replace it with:

```python
@asynccontextmanager
async def lifespan(app_: FastAPI):
    global _event_loop
    _event_loop = asyncio.get_event_loop()
    settings = get_cleaner_settings()
    _scheduler.add_job(
        run_scan, "interval",
        minutes=settings["interval_minutes"],
        id="cleaner_scan",
        replace_existing=True,
    )
    _scheduler.start()
    yield
    _scheduler.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)
```

- [ ] **Step 5: Verify server still starts**

```bash
cd "/Users/morganracon/Errol set of agent " && python -c "import server; print('ok')"
```

Expected: `ok` (no import errors)

- [ ] **Step 6: Commit**

```bash
git add server.py
git commit -m "feat: add APScheduler background scanner and SSE broadcast infrastructure"
```

---

## Task 5: Cleaner API endpoints

**Files:**
- Modify: `server.py` (add 6 endpoints)
- Create: `tests/test_cleaner_api.py`

- [ ] **Step 1: Write the failing API tests**

Create `tests/test_cleaner_api.py`:

```python
import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from server import app, CLEANER_PROPOSALS_FILE, CLEANER_SETTINGS_FILE

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_proposals(tmp_path, monkeypatch):
    proposals_file = tmp_path / "cleaner_proposals.json"
    settings_file = tmp_path / "cleaner_settings.json"
    monkeypatch.setattr("server.CLEANER_PROPOSALS_FILE", proposals_file)
    monkeypatch.setattr("server.CLEANER_SETTINGS_FILE", settings_file)
    yield
    # cleanup handled by tmp_path


def test_get_proposals_empty():
    r = client.get("/api/cleaner/proposals")
    assert r.status_code == 200
    assert r.json() == []


def test_get_proposals_returns_pending_only(tmp_path, monkeypatch):
    import server
    proposals = [
        {"id": "a1", "status": "pending", "source": "file", "action": "rename_and_move",
         "original_path": "/tmp/x.pdf", "proposed_name": "new.pdf",
         "proposed_destination": "/tmp/dest", "ai_reason": "test", "detected_at": "2026-04-30T10:00:00"},
        {"id": "b2", "status": "applied", "source": "file", "action": "delete",
         "original_path": "/tmp/y.pdf", "proposed_name": None,
         "proposed_destination": None, "ai_reason": "test", "detected_at": "2026-04-30T10:01:00"},
    ]
    monkeypatch.setattr("server.read_proposals", lambda: proposals)
    r = client.get("/api/cleaner/proposals")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == "a1"


def test_apply_renames_and_moves_file(tmp_path, monkeypatch):
    import server
    src = tmp_path / "old.pdf"
    src.write_text("content")
    dest_dir = tmp_path / "dest"

    proposals = [{
        "id": "abc123", "status": "pending", "source": "file",
        "action": "rename_and_move", "original_path": str(src),
        "proposed_name": "new.pdf", "proposed_destination": str(dest_dir),
        "ai_reason": "test", "detected_at": "2026-04-30T10:00:00"
    }]
    written = []
    monkeypatch.setattr("server.read_proposals", lambda: proposals)
    monkeypatch.setattr("server.write_proposals", lambda d: written.extend(d))

    r = client.post("/api/cleaner/apply", json={"ids": ["abc123"], "action": "apply"})
    assert r.status_code == 200
    assert (dest_dir / "new.pdf").exists()
    assert not src.exists()
    assert written[0]["status"] == "applied"


def test_apply_delete_action(tmp_path, monkeypatch):
    import server
    src = tmp_path / "screenshot.png"
    src.write_text("data")

    proposals = [{
        "id": "del1", "status": "pending", "source": "file",
        "action": "delete", "original_path": str(src),
        "proposed_name": None, "proposed_destination": None,
        "ai_reason": "capture d'écran", "detected_at": "2026-04-30T10:00:00"
    }]
    monkeypatch.setattr("server.read_proposals", lambda: proposals)
    monkeypatch.setattr("server.write_proposals", lambda d: None)

    r = client.post("/api/cleaner/apply", json={"ids": ["del1"], "action": "apply"})
    assert r.status_code == 200
    assert not src.exists()


def test_apply_ignore_action(monkeypatch):
    import server
    proposals = [{
        "id": "ign1", "status": "pending", "source": "file",
        "action": "rename_and_move", "original_path": "/tmp/x.pdf",
        "proposed_name": "new.pdf", "proposed_destination": "/tmp/dest",
        "ai_reason": "test", "detected_at": "2026-04-30T10:00:00"
    }]
    written = []
    monkeypatch.setattr("server.read_proposals", lambda: proposals)
    monkeypatch.setattr("server.write_proposals", lambda d: written.extend(d))

    r = client.post("/api/cleaner/apply", json={"ids": ["ign1"], "action": "ignore"})
    assert r.status_code == 200
    assert written[0]["status"] == "ignored"


def test_apply_stale_file_returns_error(tmp_path, monkeypatch):
    import server
    proposals = [{
        "id": "stale1", "status": "pending", "source": "file",
        "action": "rename_and_move", "original_path": str(tmp_path / "gone.pdf"),
        "proposed_name": "new.pdf", "proposed_destination": str(tmp_path / "dest"),
        "ai_reason": "test", "detected_at": "2026-04-30T10:00:00"
    }]
    monkeypatch.setattr("server.read_proposals", lambda: proposals)
    monkeypatch.setattr("server.write_proposals", lambda d: None)

    r = client.post("/api/cleaner/apply", json={"ids": ["stale1"], "action": "apply"})
    assert r.status_code == 200
    data = r.json()
    assert len(data["errors"]) == 1


def test_get_settings_returns_defaults():
    r = client.get("/api/cleaner/settings")
    assert r.status_code == 200
    data = r.json()
    assert "interval_minutes" in data
    assert "folders" in data


def test_post_settings_persists(monkeypatch, tmp_path):
    import server
    settings_file = tmp_path / "cleaner_settings.json"
    monkeypatch.setattr("server.CLEANER_SETTINGS_FILE", settings_file)
    monkeypatch.setattr("server._scheduler", MagicMock())

    from unittest.mock import MagicMock
    mock_scheduler = MagicMock()
    monkeypatch.setattr("server._scheduler", mock_scheduler)

    r = client.post("/api/cleaner/settings", json={"interval_minutes": 30})
    assert r.status_code == 200
    mock_scheduler.reschedule_job.assert_called_once_with(
        "cleaner_scan", trigger="interval", minutes=30
    )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_cleaner_api.py -v 2>&1 | head -15
```

Expected: errors about missing endpoints (404 or route not found)

- [ ] **Step 3: Add endpoints to `server.py`**

Add these endpoints after the existing feedback endpoints:

```python
# ─── Cleaner ──────────────────────────────────────────────────────────────────

@app.get("/api/cleaner/proposals")
async def get_cleaner_proposals():
    proposals = read_proposals()
    return [p for p in proposals if p["status"] == "pending"]


@app.post("/api/cleaner/apply")
async def apply_cleaner_proposals(request: Request):
    body = await request.json()
    ids = set(body.get("ids", []))
    action_type = body.get("action", "apply")

    proposals = read_proposals()
    results = {"applied": [], "ignored": [], "errors": []}

    for p in proposals:
        if p["id"] not in ids:
            continue
        if action_type == "ignore":
            p["status"] = "ignored"
            results["ignored"].append(p["id"])
            continue
        try:
            if p["action"] == "rename_and_move":
                src = Path(p["original_path"])
                dest_dir = Path(p["proposed_destination"])
                dest_dir.mkdir(parents=True, exist_ok=True)
                src.rename(dest_dir / p["proposed_name"])
                p["status"] = "applied"
                results["applied"].append(p["id"])
            elif p["action"] == "delete":
                Path(p["original_path"]).unlink(missing_ok=True)
                p["status"] = "applied"
                results["applied"].append(p["id"])
            elif p["action"] in ("email_flag", "review_manually"):
                p["status"] = "applied"
                results["applied"].append(p["id"])
        except FileNotFoundError:
            p["status"] = "stale"
            results["errors"].append({"id": p["id"], "error": "Fichier introuvable"})
        except Exception as e:
            results["errors"].append({"id": p["id"], "error": str(e)})

    write_proposals(proposals)
    return results


@app.get("/api/cleaner/settings")
async def get_settings():
    return get_cleaner_settings()


@app.post("/api/cleaner/settings")
async def update_settings(request: Request):
    body = await request.json()
    settings = get_cleaner_settings()
    settings.update({k: v for k, v in body.items() if k in (
        "interval_minutes", "folders", "max_age_days"
    )})
    CLEANER_SETTINGS_FILE.write_text(
        json.dumps(settings, ensure_ascii=False), encoding="utf-8"
    )
    if "interval_minutes" in body:
        _scheduler.reschedule_job(
            "cleaner_scan", trigger="interval", minutes=body["interval_minutes"]
        )
    return settings


@app.post("/api/cleaner/scan")
async def trigger_scan():
    import threading
    threading.Thread(target=run_scan, daemon=True).start()
    return {"status": "started"}


@app.get("/api/cleaner/events")
async def cleaner_events(request: Request):
    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    async with _sse_lock:
        _sse_clients.add(q)

    async def generate() -> AsyncGenerator[str, None]:
        try:
            yield 'data: {"type":"connected"}\n\n'
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            async with _sse_lock:
                _sse_clients.discard(q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 4: Run all API tests**

```bash
pytest tests/test_cleaner_api.py -v
```

Expected: all tests PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
pytest -v
```

Expected: all existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add server.py tests/test_cleaner_api.py
git commit -m "feat: add cleaner API endpoints (proposals, apply, settings, scan, SSE)"
```

---

## Task 6: Frontend HTML — sidebar button and agent section

**Files:**
- Modify: `interface/index.html`

- [ ] **Step 1: Add the sidebar nav button with badge**

In `interface/index.html`, find the last `<button class="agent-btn"` block (the "Créer du contenu" button) and add the cleaner button immediately after it:

```html
        <button class="agent-btn" data-agent="cleaner" id="btn-cleaner">
          <svg viewBox="0 0 24 24" class="agent-icon" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          Nettoyer mes fichiers
          <span class="cleaner-badge" id="cleaner-badge" style="display:none"></span>
        </button>
```

- [ ] **Step 2: Add badge CSS to `interface/style.css`**

Append at the end of `style.css`:

```css
/* ─── Cleaner badge ──────────────────────────────────────── */
.cleaner-badge {
  margin-left: auto;
  background: #EF4444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  min-width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  line-height: 1;
}
.agent-btn.active .cleaner-badge {
  background: rgba(255,255,255,0.3);
}

/* ─── Cleaner view ───────────────────────────────────────── */
.monitor-bar {
  background: var(--white);
  border: 1px solid var(--gray-3);
  border-radius: var(--radius);
  padding: 14px 18px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.monitor-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.monitor-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #22C55E; flex-shrink: 0;
}
.monitor-dot.scanning { background: #F59E0B; }
.monitor-text { font-size: 13px; color: var(--gray-5); }
.monitor-text strong { color: var(--black); font-weight: 600; }
.monitor-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.interval-select {
  font-size: 12px; color: var(--gray-5);
  background: var(--gray-1); border: 1px solid var(--gray-3);
  border-radius: 5px; padding: 6px 8px;
  font-family: var(--font); cursor: pointer;
}
.scan-progress-wrap {
  height: 3px; background: var(--gray-3);
  border-radius: 2px; margin-bottom: 20px; overflow: hidden;
}
.scan-progress-bar {
  height: 100%; background: var(--blue);
  width: 0%; border-radius: 2px; transition: width 0.1s linear;
}
.log-panel {
  background: var(--white); border: 1px solid var(--gray-3);
  border-radius: var(--radius); margin-bottom: 24px; overflow: hidden;
}
.log-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; background: var(--gray-1);
  border-bottom: 1px solid var(--gray-3);
}
.log-title {
  font-size: 11px; font-weight: 600; color: var(--gray-4);
  text-transform: uppercase; letter-spacing: 0.08em;
}
.log-clear {
  font-size: 11px; color: var(--gray-4); background: none;
  border: none; cursor: pointer; font-family: var(--font);
}
.log-clear:hover { color: var(--black); }
.log-entries { max-height: 150px; overflow-y: auto; font-family: monospace; }
.log-entry {
  display: flex; gap: 10px; padding: 5px 14px;
  border-bottom: 1px solid var(--gray-3); font-size: 12px;
  animation: fadeSlideIn 0.25s ease forwards;
}
.log-entry:last-child { border-bottom: none; }
.log-time { color: var(--gray-4); flex-shrink: 0; }
.log-dot { font-size: 9px; flex-shrink: 0; line-height: 1.6; }
.log-dot.found  { color: #16A34A; }
.log-dot.email  { color: var(--blue); }
.log-dot.clean  { color: var(--gray-4); }
.triage-card {
  background: var(--white); border: 1px solid var(--gray-3);
  border-radius: var(--radius); margin-bottom: 10px; overflow: hidden;
}
.triage-card-header {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-bottom: 1px solid var(--gray-3);
}
.file-type-badge {
  padding: 2px 7px; border-radius: 4px; font-size: 10px;
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0;
}
.badge-pdf  { background: #FEF2F2; color: #DC2626; }
.badge-docx { background: #F0FDF4; color: #16A34A; }
.badge-png  { background: #EFF6FF; color: #2563EB; }
.badge-jpg  { background: #EFF6FF; color: #2563EB; }
.badge-txt  { background: #F9FAFB; color: #6B7280; }
.badge-file { background: #F3F4F6; color: #6B7280; }
.file-original-name {
  font-size: 13px; color: var(--gray-5); font-family: monospace;
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.triage-toggle { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.toggle-label { font-size: 12px; color: var(--gray-4); }
.toggle-switch {
  width: 36px; height: 20px; background: var(--gray-3);
  border-radius: 10px; position: relative; cursor: pointer;
  transition: background 0.2s; border: none; outline: none;
}
.toggle-switch.on { background: var(--blue); }
.toggle-switch::after {
  content: ''; position: absolute; width: 14px; height: 14px;
  background: white; border-radius: 50%; top: 3px; left: 3px;
  transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.toggle-switch.on::after { left: 19px; }
.triage-actions { padding: 10px 16px; display: flex; flex-direction: column; gap: 6px; }
.action-row { display: flex; align-items: center; gap: 8px; }
.action-tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; padding: 4px 9px; border-radius: 5px; font-weight: 500;
}
.tag-rename { background: #F0FDF4; color: #15803D; border: 1px solid #BBF7D0; }
.tag-move   { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
.tag-delete { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }
.tag-review { background: #FFFBEB; color: #92400E; border: 1px solid #FDE68A; }
.action-value { font-size: 12px; color: var(--gray-5); }
.triage-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--gray-3);
}
.triage-summary { font-size: 13px; color: var(--gray-5); }
.triage-summary strong { color: var(--black); }
.email-item {
  background: var(--white); border: 1px solid var(--gray-3);
  border-radius: var(--radius); margin-bottom: 8px; padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
}
.email-unread { width: 8px; height: 8px; border-radius: 50%; background: var(--blue); flex-shrink: 0; }
.email-info { flex: 1; min-width: 0; }
.email-sender { font-size: 13px; font-weight: 600; }
.email-subject { font-size: 12px; color: var(--gray-5); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.email-attach {
  font-size: 11px; color: var(--blue); background: var(--blue-lt);
  padding: 3px 8px; border-radius: 4px; font-weight: 500; flex-shrink: 0;
}
.email-time { font-size: 11px; color: var(--gray-4); flex-shrink: 0; }
.cleaner-empty {
  text-align: center; padding: 32px 16px; color: var(--gray-4); font-size: 14px;
}
```

- [ ] **Step 3: Add the agent section in `index.html`**

Find the closing `</section>` of the "Créer du contenu" section (just before `</main>`) and insert the cleaner section before `</main>`:

```html
      <!-- Agent: Nettoyer mes fichiers -->
      <section class="agent-view" id="agent-cleaner">
        <p class="agent-section-label">Organisation</p>
        <h1 class="agent-title">Nettoyer mes fichiers</h1>
        <p class="agent-desc">Surveillance continue de Téléchargements et Bureau. Chaque cycle, l'agent analyse les fichiers et les emails entrants, puis vous propose des actions de rangement. Rien ne se déplace sans votre validation.</p>

        <div class="monitor-bar">
          <div class="monitor-left">
            <span class="monitor-dot" id="cleaner-monitor-dot"></span>
            <span class="monitor-text" id="cleaner-monitor-text">Surveillance active · prochain scan dans <strong id="cleaner-countdown">—</strong></span>
          </div>
          <div class="monitor-right">
            <select class="interval-select" id="cleaner-interval-select" onchange="cleanerChangeInterval()">
              <option value="10">10 sec (test)</option>
              <option value="30">30 sec</option>
              <option value="60" selected>1 min</option>
              <option value="300">5 min</option>
              <option value="900">15 min</option>
              <option value="3600">1 heure</option>
            </select>
            <button class="btn-copy" onclick="cleanerTriggerScan()">Scanner maintenant</button>
          </div>
        </div>
        <div class="scan-progress-wrap"><div class="scan-progress-bar" id="cleaner-scan-bar"></div></div>

        <div class="log-panel">
          <div class="log-header">
            <span class="log-title">Journal d'activité</span>
            <button class="log-clear" onclick="cleanerClearLog()">Effacer</button>
          </div>
          <div class="log-entries" id="cleaner-log"></div>
        </div>

        <div class="section-heading">Propositions de nettoyage</div>
        <div id="cleaner-proposals-list"></div>

        <div class="triage-footer" id="cleaner-footer" style="display:none">
          <span class="triage-summary" id="cleaner-summary"></span>
          <div style="display:flex;gap:10px">
            <button class="btn-copy" onclick="cleanerIgnoreAll()">Tout ignorer</button>
            <button class="btn-primary" onclick="cleanerApplySelected()">Appliquer la sélection</button>
          </div>
        </div>

        <div class="section-heading" id="cleaner-emails-heading" style="display:none;margin-top:36px">Emails avec pièces jointes</div>
        <div id="cleaner-emails-list"></div>
      </section>
```

- [ ] **Step 4: Verify HTML is valid (no parse errors)**

```bash
python -c "
from html.parser import HTMLParser
class V(HTMLParser): pass
p = V()
p.feed(open('interface/index.html').read())
print('HTML OK')
"
```

Expected: `HTML OK`

- [ ] **Step 5: Commit**

```bash
git add interface/index.html interface/style.css
git commit -m "feat: add cleaner agent HTML section and CSS"
```

---

## Task 7: Frontend JS — SSE, proposal rendering, apply handler, notifications

**Files:**
- Modify: `interface/app.js`

- [ ] **Step 1: Add SSE initialisation and badge updater**

At the top of `app.js`, after the existing global variable declarations, add:

```javascript
// ─── Cleaner state ────────────────────────────────────────
let cleanerEventSource = null;
let cleanerBadgeCount  = 0;
let cleanerProposals   = [];
let cleanerSelected    = new Set();
let cleanerInterval    = 60;
let cleanerCountdown   = 60;
let cleanerTimer       = null;

function cleanerUpdateBadge(count) {
  const badge = document.getElementById('cleaner-badge');
  if (!badge) return;
  cleanerBadgeCount = count;
  badge.textContent  = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

function cleanerInitSSE() {
  if (cleanerEventSource) return;
  cleanerEventSource = new EventSource('/api/cleaner/events');

  cleanerEventSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    if (event.type === 'new_proposals') {
      cleanerUpdateBadge(cleanerBadgeCount + event.count);
      if (Notification.permission === 'granted' && event.count > 0) {
        new Notification('Le Play Avocats', {
          body: `${event.count} nouvelle${event.count > 1 ? 's' : ''} proposition${event.count > 1 ? 's' : ''} de nettoyage`,
        });
      }
      if (document.getElementById('agent-cleaner')?.classList.contains('active')) {
        cleanerLoadProposals();
      }
    }
    if (event.type === 'scan_complete') {
      cleanerScanDone(event.found);
    }
  };

  cleanerEventSource.onerror = () => {
    cleanerEventSource.close();
    cleanerEventSource = null;
    setTimeout(cleanerInitSSE, 5000);
  };
}
```

- [ ] **Step 2: Add countdown timer functions**

```javascript
function cleanerStartCountdown(seconds) {
  clearInterval(cleanerTimer);
  cleanerCountdown = seconds;
  cleanerInterval  = seconds;
  cleanerTickDown();
  cleanerTimer = setInterval(cleanerTickDown, 1000);
}

function cleanerTickDown() {
  const el = document.getElementById('cleaner-countdown');
  if (!el) return;
  if (cleanerCountdown <= 0) {
    clearInterval(cleanerTimer);
    return;
  }
  cleanerCountdown--;
  el.textContent = cleanerCountdown < 60
    ? cleanerCountdown + 's'
    : Math.round(cleanerCountdown / 60) + ' min';
}

function cleanerChangeInterval() {
  const select = document.getElementById('cleaner-interval-select');
  const minutes = parseInt(select.value) / 60 || 1;
  const seconds = parseInt(select.value);
  fetch('/api/cleaner/settings', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({interval_minutes: Math.max(1, Math.round(seconds / 60))})
  });
  cleanerStartCountdown(seconds);
}
```

- [ ] **Step 3: Add proposal loading and rendering functions**

```javascript
async function cleanerLoadProposals() {
  const r = await fetch('/api/cleaner/proposals');
  cleanerProposals = await r.json();

  const fileProposals  = cleanerProposals.filter(p => p.source === 'file');
  const emailProposals = cleanerProposals.filter(p => p.source === 'email');

  cleanerSelected = new Set(cleanerProposals.map(p => p.id));
  cleanerRenderProposals(fileProposals);
  cleanerRenderEmails(emailProposals);
  cleanerUpdateFooter();
  cleanerUpdateBadge(fileProposals.length + emailProposals.length);
}

function cleanerExtBadge(ext) {
  const e = (ext || '').toLowerCase().replace('.', '');
  const known = ['pdf','docx','doc','png','jpg','jpeg','txt','xlsx','xls'];
  return known.includes(e) ? e : 'file';
}

function cleanerRenderProposals(proposals) {
  const list = document.getElementById('cleaner-proposals-list');
  if (!proposals.length) {
    list.innerHTML = '<div class="cleaner-empty">Aucun fichier à traiter.</div>';
    document.getElementById('cleaner-footer').style.display = 'none';
    return;
  }
  document.getElementById('cleaner-footer').style.display = 'flex';
  list.innerHTML = proposals.map(p => {
    const ext  = p.original_path?.split('.').pop() || '';
    const name = p.original_path?.split('/').pop() || '';
    const actions = cleanerRenderActions(p);
    return `
    <div class="triage-card" id="card-${p.id}">
      <div class="triage-card-header">
        <span class="file-type-badge badge-${cleanerExtBadge(ext)}">${ext.toUpperCase()}</span>
        <span class="file-original-name" title="${name}">${name}</span>
        <div class="triage-toggle">
          <span class="toggle-label" id="lbl-${p.id}">Actif</span>
          <button class="toggle-switch on" id="tog-${p.id}" onclick="cleanerToggle('${p.id}')"></button>
        </div>
      </div>
      <div class="triage-actions">${actions}</div>
    </div>`;
  }).join('');
}

function cleanerRenderActions(p) {
  if (p.action === 'delete') {
    return `<div class="action-row">
      <span class="action-tag tag-delete">🗑️ Supprimer</span>
      <span class="action-value">${p.ai_reason}</span>
    </div>`;
  }
  if (p.action === 'rename_and_move') {
    return `<div class="action-row">
        <span class="action-tag tag-rename">✏️ Renommer</span>
        <span class="action-value">→ ${p.proposed_name}</span>
      </div>
      <div class="action-row">
        <span class="action-tag tag-move">📁 Déplacer</span>
        <span class="action-value">→ ${p.proposed_destination}</span>
      </div>`;
  }
  return `<div class="action-row">
    <span class="action-tag tag-review">👁 Examiner</span>
    <span class="action-value">${p.ai_reason}</span>
  </div>`;
}

function cleanerRenderEmails(emails) {
  const heading = document.getElementById('cleaner-emails-heading');
  const list    = document.getElementById('cleaner-emails-list');
  if (!emails.length) {
    heading.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  heading.style.display = 'block';
  list.innerHTML = emails.map(p => {
    const meta  = p.email_meta || {};
    const count = (meta.attachments || []).length;
    const time  = meta.received_at
      ? new Date(meta.received_at).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})
      : '';
    return `<div class="email-item">
      <span class="email-unread"></span>
      <div class="email-info">
        <div class="email-sender">${meta.sender || ''}</div>
        <div class="email-subject">${meta.subject || ''}</div>
      </div>
      <span class="email-attach">📎 ${count} fichier${count > 1 ? 's' : ''}</span>
      <span class="email-time">${time}</span>
    </div>`;
  }).join('');
}

function cleanerUpdateFooter() {
  const count = cleanerSelected.size;
  const summary = document.getElementById('cleaner-summary');
  if (summary) {
    summary.innerHTML = `<strong>${count} action${count > 1 ? 's' : ''}</strong> sélectionnée${count > 1 ? 's' : ''}`;
  }
}

function cleanerToggle(id) {
  const tog = document.getElementById('tog-' + id);
  const lbl = document.getElementById('lbl-' + id);
  if (!tog) return;
  const isOn = tog.classList.toggle('on');
  lbl.textContent = isOn ? 'Actif' : 'Ignoré';
  if (isOn) cleanerSelected.add(id);
  else cleanerSelected.delete(id);
  cleanerUpdateFooter();
}

function cleanerIgnoreAll() {
  cleanerProposals.forEach(p => {
    const tog = document.getElementById('tog-' + p.id);
    const lbl = document.getElementById('lbl-' + p.id);
    if (tog) { tog.classList.remove('on'); lbl.textContent = 'Ignoré'; }
  });
  cleanerSelected.clear();
  cleanerUpdateFooter();
}

async function cleanerApplySelected() {
  if (!cleanerSelected.size) return;
  const r = await fetch('/api/cleaner/apply', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ids: [...cleanerSelected], action: 'apply'})
  });
  const result = await r.json();
  cleanerAddLog('clean', `${result.applied.length} action(s) appliquée(s)`
    + (result.errors.length ? ` · ${result.errors.length} erreur(s)` : ''));
  cleanerUpdateBadge(0);
  await cleanerLoadProposals();
}
```

- [ ] **Step 4: Add scan trigger and log helpers**

```javascript
async function cleanerTriggerScan() {
  const dot  = document.getElementById('cleaner-monitor-dot');
  const text = document.getElementById('cleaner-monitor-text');
  const bar  = document.getElementById('cleaner-scan-bar');
  if (dot)  dot.classList.add('scanning');
  if (text) text.innerHTML = 'Analyse en cours… <strong>Téléchargements + Bureau</strong>';

  let prog = 0;
  const pTimer = setInterval(() => {
    prog = Math.min(prog + Math.random() * 12, 95);
    if (bar) bar.style.width = prog + '%';
  }, 150);

  await fetch('/api/cleaner/scan', {method: 'POST'});

  setTimeout(() => {
    clearInterval(pTimer);
    if (bar) { bar.style.width = '100%'; setTimeout(() => { bar.style.width = '0%'; }, 400); }
  }, 1800);
}

function cleanerScanDone(found) {
  const dot  = document.getElementById('cleaner-monitor-dot');
  const text = document.getElementById('cleaner-monitor-text');
  if (dot)  dot.classList.remove('scanning');
  if (text) text.innerHTML = `Surveillance active · prochain scan dans <strong id="cleaner-countdown">${cleanerCountdown}s</strong>`;
  const msg = found > 0
    ? `${found} élément(s) détecté(s)`
    : 'Scan terminé — aucun nouveau fichier';
  cleanerAddLog(found > 0 ? 'found' : 'clean', msg);
  if (found > 0) cleanerLoadProposals();
}

function cleanerAddLog(type, msg) {
  const log = document.getElementById('cleaner-log');
  if (!log) return;
  const time = new Date().toLocaleTimeString('fr-FR');
  const div  = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">${time}</span><span class="log-dot ${type}">●</span><span>${msg}</span>`;
  log.insertBefore(div, log.firstChild);
  while (log.children.length > 20) log.removeChild(log.lastChild);
}

function cleanerClearLog() {
  const log = document.getElementById('cleaner-log');
  if (log) log.innerHTML = '';
}
```

- [ ] **Step 5: Add notification permission request**

```javascript
function cleanerRequestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
```

- [ ] **Step 6: Wire up initialisation on page load**

Find the existing `document.addEventListener('DOMContentLoaded', ...)` block in `app.js`. Inside it, after the last existing init call, add:

```javascript
  cleanerInitSSE();
  cleanerRequestNotificationPermission();
  fetch('/api/cleaner/settings')
    .then(r => r.json())
    .then(s => {
      cleanerStartCountdown(s.interval_minutes * 60);
      const sel = document.getElementById('cleaner-interval-select');
      if (sel) {
        const val = String(s.interval_minutes * 60);
        if ([...sel.options].some(o => o.value === val)) sel.value = val;
      }
    });
```

- [ ] **Step 7: Wire up cleaner agent view activation**

Find the `showAgent(name)` function (or equivalent routing function) in `app.js`. In the section that handles switching views, add a call to load proposals when the cleaner view is activated. Find the pattern where `currentAgent` is set and add:

```javascript
  if (name === 'cleaner') {
    cleanerLoadProposals();
  }
```

- [ ] **Step 8: Start the server and test manually**

```bash
cd "/Users/morganracon/Errol set of agent " && uvicorn server:app --port 3000 --reload
```

Open `http://localhost:3000`, click "Nettoyer mes fichiers" in the sidebar. Verify:
- The monitor bar shows "Surveillance active"
- The countdown ticks down
- Clicking "Scanner maintenant" triggers the progress bar
- Changing the interval dropdown calls the API (check server logs)
- Notification permission dialog appears

- [ ] **Step 9: Commit**

```bash
git add interface/app.js
git commit -m "feat: add cleaner frontend — SSE listener, proposal rendering, apply handler, notifications"
```

---

## Task 8: Workflow file

**Files:**
- Create: `workflows/file_cleaner.md`

- [ ] **Step 1: Create the workflow**

Create `workflows/file_cleaner.md`:

```markdown
# Workflow: File Cleaner Agent

## Objective
Continuously monitor Downloads and Desktop for files to organise, and Outlook for emails with attachments. Surface proposals to Errol for approval. Never move or delete anything without explicit user action.

## Trigger
Runs automatically on a configurable schedule (default: 60 minutes). Can also be triggered manually via the interface.

## Required Inputs
- Configured scan folders (default: ~/Downloads, ~/Desktop)
- Ollama running at OLLAMA_BASE_URL (required for classification)
- ONEDRIVE_PATH (destination root for moved files)
- OUTLOOK_* env vars (optional — email monitoring disabled if absent)

## Steps

### 1. Scan folders
- Call `tools/file_cleaner.scan_folders(folders, max_age_days, known_paths)`
- `known_paths` = set of original_path values already in cleaner_proposals.json with any status
- Returns list of new proposals

### 2. Scan emails (if configured)
- Call `tools/outlook_monitor.scan_emails(since, known_ids)`
- `since` = detected_at of last email proposal (or None for first run)
- `known_ids` = set of original_path values of existing email proposals
- Returns list of new proposals (empty if credentials missing)

### 3. Persist proposals
- Append new proposals to data/cleaner_proposals.json
- Never overwrite existing entries — append only

### 4. Notify connected clients
- Broadcast SSE event `{type: "new_proposals", count: N}` to all open browser tabs
- Browser fires Notification API popup if permission granted

### 5. Wait for user approval
- User opens "Nettoyer mes fichiers" in the cockpit
- Reviews triage cards, toggles off any unwanted actions
- Clicks "Appliquer la sélection"
- Server executes only approved actions via POST /api/cleaner/apply

## Outputs
- Updated data/cleaner_proposals.json (statuses: applied / ignored)
- Files renamed and moved to OneDrive subfolders
- Deleted files removed from filesystem

## Error Handling
- Ollama offline: skip AI classification, mark files action=review_manually, still surface them
- Graph API failure: log warning, skip email scan for this cycle, continue with file scan
- File moved before apply: catch FileNotFoundError, mark proposal stale, show warning in UI
- OneDrive folder missing: create it with mkdir(parents=True) before moving

## Edge Cases
- File already in correct location: Ollama should return action=review_manually; user can ignore
- Duplicate filename at destination: append _1, _2 suffix before moving
- Empty Downloads/Desktop: scan completes with 0 proposals, logs "Scan terminé — aucun nouveau fichier"
```

- [ ] **Step 2: Commit**

```bash
git add workflows/file_cleaner.md
git commit -m "docs: add file cleaner workflow SOP"
```

---

## Task 9: Final integration test and .env.example update

**Files:**
- Modify: `.env.example`
- Modify: `tests/test_cleaner_api.py` (add one integration smoke test)

- [ ] **Step 1: Update `.env.example`**

Open `.env.example` and add the cleaner configuration block:

```bash
# File Cleaner Agent
CLEANER_INTERVAL_MINUTES=60
CLEANER_FOLDERS=~/Downloads,~/Desktop
CLEANER_MAX_FILE_AGE_DAYS=30

# Outlook monitoring (optional — leave blank to disable email monitoring)
OUTLOOK_CLIENT_ID=
OUTLOOK_CLIENT_SECRET=
OUTLOOK_TENANT_ID=
OUTLOOK_USER_EMAIL=
```

- [ ] **Step 2: Add a smoke test for the full apply flow**

Add to `tests/test_cleaner_api.py`:

```python
def test_scan_endpoint_returns_started(monkeypatch):
    monkeypatch.setattr("server.run_scan", lambda: None)
    r = client.post("/api/cleaner/scan")
    assert r.status_code == 200
    assert r.json()["status"] == "started"

def test_settings_endpoint_round_trip(monkeypatch, tmp_path):
    import server
    settings_file = tmp_path / "cleaner_settings.json"
    monkeypatch.setattr("server.CLEANER_SETTINGS_FILE", settings_file)

    from unittest.mock import MagicMock
    mock_scheduler = MagicMock()
    monkeypatch.setattr("server._scheduler", mock_scheduler)

    r = client.post("/api/cleaner/settings", json={"interval_minutes": 15})
    assert r.status_code == 200
    assert r.json()["interval_minutes"] == 15

    r2 = client.get("/api/cleaner/settings")
    assert r2.json()["interval_minutes"] == 15
```

- [ ] **Step 3: Run the full test suite**

```bash
pytest -v
```

Expected: all tests PASS, no regressions

- [ ] **Step 4: Final commit**

```bash
git add .env.example tests/test_cleaner_api.py
git commit -m "feat: complete file cleaner agent — scanner, Outlook monitor, SSE, triage UI"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Background scheduler (APScheduler) — Task 4
- ✅ File scanner + Ollama classification — Task 2
- ✅ Outlook monitor with graceful degradation — Task 3
- ✅ `data/cleaner_proposals.json` append-only store — Tasks 4 + 5
- ✅ SSE push to open browser clients — Tasks 4 + 5 + 7
- ✅ Browser Notification API — Task 7
- ✅ Sidebar badge — Tasks 6 + 7
- ✅ Triage cards with toggles — Tasks 6 + 7
- ✅ Apply / ignore endpoints — Task 5
- ✅ Configurable interval from UI — Tasks 6 + 7 + 8
- ✅ Error handling (Ollama offline, stale file, Graph auth failure) — Tasks 2 + 3 + 5
- ✅ `review_manually` action type — Tasks 2 + 7
- ✅ Workflow SOP — Task 8
- ✅ `.env.example` updated — Task 9
