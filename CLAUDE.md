# Agent Instructions — Le Play Avocats AI Platform

You're working inside the **WAT framework** (Workflows, Agents, Tools). This architecture separates concerns so that probabilistic AI handles reasoning while deterministic code handles execution. That separation is what makes this system reliable.

> **LANGUAGE RULE — CRITICAL:** All your reasoning, code, comments, and internal logic are in English. However, **all outputs visible to the end user (interface text, agent responses, generated documents, invoices, letters, summaries, LinkedIn posts, etc.) must be in French.** Errol Cohen is a French lawyer. Everything he sees must be in French.

---

## Project Context

**Client:** Errol Cohen — Cabinet Le Play Avocats
**Website:** leplaylaw.com / societeamission.com
**Specialty:** Sociétés à mission, raison d'être, corporate law
**Structure:** Solo lawyer + external contractors

**Objective:** Build a centralized AI interface allowing Errol to activate specialized AI agents from a single cockpit. The system runs locally on his dedicated Mac Mini M4 — no client data ever leaves his machine.

**Developer:** Morgan — AI & Automation Consultant
**Delivery workflow:** Morgan develops on his Mac → git push → Errol runs git pull on his Mac Mini M4

---

## Tech Stack

**Local AI Engine:**
- Runtime: Ollama (http://localhost:11434)
- Primary model: Gemma 4 e4b (9.6GB, 128K context window, Text + Image + Audio)
- Fallback model: Mistral 7B
- The Mac Mini is dedicated exclusively to this project — 16GB RAM fully available

**Interface:**
- Local web application (port 3000)
- Accessible from any device via Cloudflare Tunnel
- Clean, minimal, branded Le Play Avocats (colors: black, white, gold)
- All interface text, labels, buttons, and messages in French

**Orchestration:**
- Python scripts in `tools/`
- Markdown workflows in `workflows/`
- Environment variables in `.env`

**Data:**
- Client documents: Errol's OneDrive
- RAG collections: indexed locally
- No client data ever sent to external cloud services

---

## The WAT Architecture

**Layer 1: Workflows (The Instructions)**
- Markdown SOPs stored in `workflows/`
- Each workflow defines the objective, required inputs, which tools to use, expected outputs, and how to handle edge cases
- Written in plain English, the same way you'd brief someone on your team

**Layer 2: Agents (The Decision-Maker)**
- This is your role. You're responsible for intelligent coordination.
- Read the relevant workflow, run tools in the correct sequence, handle failures gracefully, and ask clarifying questions when needed
- You connect intent to execution without trying to do everything yourself
- Example: If you need to query documents, read `workflows/rag_query.md`, figure out the required inputs, then execute `tools/query_documents.py`

**Layer 3: Tools (The Execution)**
- Python scripts in `tools/` that do the actual work
- Ollama API calls, document parsing, file operations, OneDrive sync
- Credentials and API keys stored in `.env`
- These scripts are consistent, testable, and fast

**Why this matters:** When AI tries to handle every step directly, accuracy drops fast. If each step is 90% accurate, you're down to 59% success after just five steps. By offloading execution to deterministic scripts, you stay focused on orchestration and decision-making where you excel.

---

## Business Agents to Build

Each agent is accessible from the main interface via a dedicated button. Errol activates the agent he needs, describes his request in natural French, and the agent handles the rest.

All agent responses, generated content, and outputs must be in French.

### Agent 1 — RAG Document Query
**Business name (shown to Errol):** "Interroger mes dossiers"
**Objective:** Query the firm's document base in natural language
**Sources:** OneDrive documents (Word, PDF, archived emails)
**Workflow:** `workflows/rag_query.md`
**Tools:** `tools/query_documents.py`, `tools/index_documents.py`
**Example input:** "Quelles sont les obligations du comité de mission dans le dossier Dupont ?"
**Expected output:** Sourced answer in French citing the relevant document

### Agent 2 — Letter & Document Drafting
**Business name (shown to Errol):** "Rédiger un courrier"
**Objective:** Draft legal letters from a natural language description
**Workflow:** `workflows/draft_letter.md`
**Tools:** `tools/generate_document.py`
**Example input:** "Rédige un courrier de mise en demeure pour la société Martin"
**Expected output:** Full letter in French, ready to copy/paste or export

### Agent 3 — Document Summary
**Business name (shown to Errol):** "Résumer un document"
**Objective:** Quickly summarize long documents (acts, judgments, contracts)
**Workflow:** `workflows/summarize_document.md`
**Tools:** `tools/summarize_document.py`
**Example input:** PDF upload → structured summary
**Expected output:** 5-point structured summary in French

### Agent 4 — Invoice Generation
**Business name (shown to Errol):** "Générer une facture"
**Objective:** Generate invoices from a natural language description of the service
**Workflow:** `workflows/generate_invoice.md`
**Tools:** `tools/generate_invoice.py`
**Example input:** "Facture pour 3h de conseil en transformation société à mission pour la société ABC à 350€/h"
**Expected output:** Formatted invoice in French with all required legal fields

### Agent 5 — Hearing Preparation
**Business name (shown to Errol):** "Préparer une audience"
**Objective:** Prepare a structured summary of arguments and key points before a hearing
**Workflow:** `workflows/prepare_hearing.md`
**Tools:** `tools/prepare_hearing.py`
**Example input:** "Prépare un résumé des arguments pour l'audience du 15 avril dans le dossier Legrand"
**Expected output:** Structured argument sheet in French

### Agent 6 — Content Generation
**Business name (shown to Errol):** "Créer du contenu"
**Objective:** Generate LinkedIn posts or legal articles in Errol's writing style
**Workflow:** `workflows/generate_content.md`
**Tools:** `tools/generate_content.py`
**Example input:** "Rédige un post LinkedIn sur les nouvelles obligations des sociétés à mission en 2025"
**Expected output:** Ready-to-publish LinkedIn post in French

> **Note:** Additional agents can be added over time based on Errol's needs. Each new agent follows the same structure: workflow + tool + button in the interface. Keep the architecture modular.

---

## Interface Specifications

**Principle:** A simple cockpit. Errol sees his available agents, activates one, describes his need in French, and receives the result.

**Interface structure:**
```
Header  : Le Play Avocats logo + system status (Ollama active/inactive)
Body    : Agent grid — one card per agent
          └── Click on an agent → input area + result display
Footer  : System info (active model, version)
```

**UX Principles:**
- Errol is not technical — the interface must be self-evident
- No technical jargon visible to the user
- Each agent has a business name in French, not a technical one
- Results displayed clearly with a copy button
- Simple file upload (drag & drop)
- All interface text, placeholders, buttons, error messages in French

**Brand colors:** Black `#0D0D0D`, White `#FFFFFF`, Gold `#B8963E`
**Font:** Inter (system)
**Local access:** http://localhost:3000
**Remote access:** via Cloudflare Tunnel URL

---

## Project File Structure

```
leplay-ia/
├── CLAUDE.md                    # This file — agent instructions
├── .env                         # API keys and variables (NEVER commit)
├── .env.example                 # Template of required variables
├── README.md                    # Installation instructions for Errol
├── start.sh                     # Launch the interface with a double-click
├── update.sh                    # git pull + restart
│
├── interface/                   # Web application
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── tools/                       # Python scripts — deterministic execution
│   ├── query_documents.py       # RAG query on documents
│   ├── index_documents.py       # OneDrive document indexing
│   ├── generate_document.py     # Letter/contract generation
│   ├── summarize_document.py    # Document summarization
│   ├── generate_invoice.py      # Invoice generation
│   ├── prepare_hearing.py       # Hearing preparation
│   ├── generate_content.py      # LinkedIn/article content generation
│   └── ollama_client.py         # Shared Ollama client
│
├── workflows/                   # Markdown SOPs — agent instructions
│   ├── rag_query.md
│   ├── draft_letter.md
│   ├── summarize_document.md
│   ├── generate_invoice.md
│   ├── prepare_hearing.md
│   └── generate_content.md
│
└── data/                        # Local data
    ├── index/                   # Vector index of documents
    └── templates/               # Document templates (invoices, letters)
```

---

## Environment Variables (.env)

```bash
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e4b

# Interface
PORT=3000

# OneDrive document path
ONEDRIVE_PATH=/Users/errol/OneDrive

# Optional — cloud API fallback if needed
# MISTRAL_API_KEY=your_key_here
```

---

## How to Operate

**1. Look for existing tools first**
Before building anything new, check `tools/` based on what your workflow requires. Only create new scripts when nothing exists for that task.

**2. Learn and adapt when things fail**
When you hit an error:
- Read the full error message and trace
- Fix the script and retest
- Document what you learned in the workflow
- If the fix involves paid API calls, check with Morgan before running again

**3. Keep workflows current**
Workflows should evolve as you learn. When you find better methods, discover constraints, or encounter recurring issues, update the workflow. Don't create or overwrite workflows without asking unless explicitly told to.

**4. Locality principle**
Everything runs locally on Errol's Mac Mini. Never send client data to external services without explicit authorization. Ollama is the only authorized AI brain by default.

**5. Language discipline**
- Code, comments, variable names, workflow files → English
- Everything the user sees → French
- This is non-negotiable. A French lawyer's professional tool must be in French.

---

## Delivery Principles

- **Simplicity first:** If it's hard to explain to Errol, it's too complex
- **Modular:** Each agent is independent — add new ones without breaking existing ones
- **Robust:** Error handling on every tool — never silent crashes
- **Documented:** Every tool has clear comments, every workflow is up to date
- **Clean git:** Atomic commits, clear messages, never secrets in the repo

---

## Bottom Line

You're building the operational brain of a Parisian law firm specializing in mission-driven companies. The client is not technical. Every delivery must be usable by someone who doesn't know what a terminal is. The quality of this project is the case study that will close the next 10 clients.

Stay pragmatic. Stay reliable. Keep everything simple. Keep everything in French for the user.
