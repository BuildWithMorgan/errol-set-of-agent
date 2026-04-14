# WAT Framework Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the full empty folder and file structure for the Le Play Avocats AI platform following the WAT (Workflows, Agents, Tools) framework.

**Architecture:** Three strictly separated WAT layers (`workflows/`, `tools/`, `interface/`) plus a dedicated `agents/` folder as a per-agent debugging hub. No content is written — structure only.

**Tech Stack:** Shell (file creation), Git

---

## File Map

| Path | Purpose |
|------|---------|
| `.env` | Secrets — never commit |
| `.env.example` | Template of required variables |
| `README.md` | Installation instructions for Errol |
| `start.sh` | Launch interface with double-click |
| `update.sh` | git pull + restart |
| `interface/index.html` | Web app entry point |
| `interface/style.css` | Styling |
| `interface/app.js` | Frontend logic |
| `interface/inspiration/` | Brand assets and screenshots from leplaylaw.com |
| `agents/rag-query/README.md` | Debugging hub for RAG query agent |
| `agents/draft-letter/README.md` | Debugging hub for letter drafting agent |
| `agents/summarize-document/README.md` | Debugging hub for document summary agent |
| `agents/generate-invoice/README.md` | Debugging hub for invoice generation agent |
| `agents/prepare-hearing/README.md` | Debugging hub for hearing preparation agent |
| `agents/generate-content/README.md` | Debugging hub for content generation agent |
| `workflows/rag_query.md` | WAT Layer 1 — RAG query SOP |
| `workflows/draft_letter.md` | WAT Layer 1 — Letter drafting SOP |
| `workflows/summarize_document.md` | WAT Layer 1 — Document summary SOP |
| `workflows/generate_invoice.md` | WAT Layer 1 — Invoice generation SOP |
| `workflows/prepare_hearing.md` | WAT Layer 1 — Hearing preparation SOP |
| `workflows/generate_content.md` | WAT Layer 1 — Content generation SOP |
| `tools/ollama_client.py` | Shared Ollama client (used by all agents) |
| `tools/query_documents.py` | RAG query execution |
| `tools/index_documents.py` | OneDrive document indexing |
| `tools/generate_document.py` | Letter/contract generation |
| `tools/summarize_document.py` | Document summarization |
| `tools/generate_invoice.py` | Invoice generation |
| `tools/prepare_hearing.py` | Hearing preparation |
| `tools/generate_content.py` | LinkedIn/article content generation |
| `data/index/` | Vector index of RAG documents |
| `data/templates/` | Document templates (invoices, letters) |

---

### Task 1: Initialize git and root files

**Files:**
- Create: `.env`
- Create: `.env.example`
- Create: `README.md`
- Create: `start.sh`
- Create: `update.sh`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repository**

Run from `/Users/morganracon/Errol set of agent /`:
```bash
git init
```
Expected: `Initialized empty Git repository in .../Errol set of agent /.git/`

- [ ] **Step 2: Create .gitignore**

Create `.gitignore` with this content:
```
.env
data/index/
__pycache__/
*.pyc
.DS_Store
```

- [ ] **Step 3: Create root empty files**

Create these as empty files:
- `.env`
- `.env.example`
- `README.md`
- `start.sh`
- `update.sh`

- [ ] **Step 4: Verify root structure**

Run:
```bash
ls -la "/Users/morganracon/Errol set of agent /"
```
Expected: `.env`, `.env.example`, `.gitignore`, `README.md`, `start.sh`, `update.sh`, `CLAUDE.md`, `docs/` visible.

- [ ] **Step 5: Commit**

```bash
git add .gitignore .env.example README.md start.sh update.sh
git commit -m "chore: initialize project root structure"
```

---

### Task 2: Create interface layer

**Files:**
- Create: `interface/index.html`
- Create: `interface/style.css`
- Create: `interface/app.js`
- Create: `interface/inspiration/` (empty folder — add `.gitkeep`)

- [ ] **Step 1: Create interface folder and files**

Create these as empty files:
- `interface/index.html`
- `interface/style.css`
- `interface/app.js`
- `interface/inspiration/.gitkeep`

- [ ] **Step 2: Verify interface structure**

Run:
```bash
find "/Users/morganracon/Errol set of agent /interface" -type f
```
Expected output:
```
interface/index.html
interface/style.css
interface/app.js
interface/inspiration/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add interface/
git commit -m "chore: scaffold interface layer"
```

---

### Task 3: Create agents layer

**Files:**
- Create: `agents/rag-query/README.md`
- Create: `agents/draft-letter/README.md`
- Create: `agents/summarize-document/README.md`
- Create: `agents/generate-invoice/README.md`
- Create: `agents/prepare-hearing/README.md`
- Create: `agents/generate-content/README.md`

- [ ] **Step 1: Create agents folders and README files**

Create these as empty files:
- `agents/rag-query/README.md`
- `agents/draft-letter/README.md`
- `agents/summarize-document/README.md`
- `agents/generate-invoice/README.md`
- `agents/prepare-hearing/README.md`
- `agents/generate-content/README.md`

- [ ] **Step 2: Verify agents structure**

Run:
```bash
find "/Users/morganracon/Errol set of agent /agents" -type f
```
Expected output (6 README.md files, one per agent folder):
```
agents/draft-letter/README.md
agents/generate-content/README.md
agents/generate-invoice/README.md
agents/prepare-hearing/README.md
agents/rag-query/README.md
agents/summarize-document/README.md
```

- [ ] **Step 3: Commit**

```bash
git add agents/
git commit -m "chore: scaffold agents debugging layer"
```

---

### Task 4: Create workflows layer (WAT Layer 1)

**Files:**
- Create: `workflows/rag_query.md`
- Create: `workflows/draft_letter.md`
- Create: `workflows/summarize_document.md`
- Create: `workflows/generate_invoice.md`
- Create: `workflows/prepare_hearing.md`
- Create: `workflows/generate_content.md`

- [ ] **Step 1: Create workflow files**

Create these as empty files:
- `workflows/rag_query.md`
- `workflows/draft_letter.md`
- `workflows/summarize_document.md`
- `workflows/generate_invoice.md`
- `workflows/prepare_hearing.md`
- `workflows/generate_content.md`

- [ ] **Step 2: Verify workflows structure**

Run:
```bash
find "/Users/morganracon/Errol set of agent /workflows" -type f
```
Expected output (6 files):
```
workflows/draft_letter.md
workflows/generate_content.md
workflows/generate_invoice.md
workflows/prepare_hearing.md
workflows/rag_query.md
workflows/summarize_document.md
```

- [ ] **Step 3: Commit**

```bash
git add workflows/
git commit -m "chore: scaffold workflows layer (WAT Layer 1)"
```

---

### Task 5: Create tools layer (WAT Layer 3)

**Files:**
- Create: `tools/ollama_client.py`
- Create: `tools/query_documents.py`
- Create: `tools/index_documents.py`
- Create: `tools/generate_document.py`
- Create: `tools/summarize_document.py`
- Create: `tools/generate_invoice.py`
- Create: `tools/prepare_hearing.py`
- Create: `tools/generate_content.py`

- [ ] **Step 1: Create tool files**

Create these as empty files:
- `tools/ollama_client.py`
- `tools/query_documents.py`
- `tools/index_documents.py`
- `tools/generate_document.py`
- `tools/summarize_document.py`
- `tools/generate_invoice.py`
- `tools/prepare_hearing.py`
- `tools/generate_content.py`

- [ ] **Step 2: Verify tools structure**

Run:
```bash
find "/Users/morganracon/Errol set of agent /tools" -type f
```
Expected output (8 files):
```
tools/generate_content.py
tools/generate_document.py
tools/generate_invoice.py
tools/index_documents.py
tools/ollama_client.py
tools/prepare_hearing.py
tools/query_documents.py
tools/summarize_document.py
```

- [ ] **Step 3: Commit**

```bash
git add tools/
git commit -m "chore: scaffold tools layer (WAT Layer 3)"
```

---

### Task 6: Create data layer

**Files:**
- Create: `data/index/.gitkeep`
- Create: `data/templates/.gitkeep`

- [ ] **Step 1: Create data folders**

Create these files (to track empty folders in git):
- `data/index/.gitkeep`
- `data/templates/.gitkeep`

- [ ] **Step 2: Verify data structure**

Run:
```bash
find "/Users/morganracon/Errol set of agent /data" -type f
```
Expected:
```
data/index/.gitkeep
data/templates/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add data/
git commit -m "chore: scaffold data layer"
```

---

### Task 7: Final verification

- [ ] **Step 1: Verify complete structure**

Run:
```bash
find "/Users/morganracon/Errol set of agent " -not -path "*/.git/*" | sort
```
Expected output should show all folders and files from the design spec.

- [ ] **Step 2: Verify git log**

Run:
```bash
git log --oneline
```
Expected (5 commits in order):
```
chore: scaffold data layer
chore: scaffold tools layer (WAT Layer 3)
chore: scaffold workflows layer (WAT Layer 1)
chore: scaffold agents debugging layer
chore: scaffold interface layer
chore: initialize project root structure
```

- [ ] **Step 3: Done**

Project structure is complete. All layers are in place. Ready to fill in content layer by layer.
