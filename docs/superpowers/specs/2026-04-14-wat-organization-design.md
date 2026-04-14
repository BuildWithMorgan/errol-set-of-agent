# Design Spec — WAT Framework Project Structure
**Date:** 2026-04-14  
**Project:** Le Play Avocats AI Platform  
**Author:** Morgan  

---

## Context

Greenfield project. Only `CLAUDE.md` exists. This spec defines the full folder and file structure to scaffold before any code is written.

The architecture follows the **WAT framework** (Workflows, Agents, Tools) as defined in `CLAUDE.md`, with one addition: a dedicated `agents/` layer that serves as a per-agent debugging hub without breaking WAT separation.

---

## Design Decision

**Hybrid A+B structure:** WAT layers remain strictly separated (`workflows/`, `tools/`), but an `agents/` folder provides a front door per agent. When an agent breaks, you go to `agents/<agent-name>/` first — its `README.md` links to the relevant workflow and tool and will accumulate debug notes over time.

This keeps the architecture clean while making the system navigable for a non-technical user and debuggable for the developer.

---

## Full File Structure

```
Errol set of agent/
├── CLAUDE.md                        # Agent instructions (already exists)
├── .env                             # Secrets — never commit
├── .env.example                     # Template of required variables
├── README.md                        # Installation instructions for Errol
├── start.sh                         # Launch interface with double-click
├── update.sh                        # git pull + restart
│
├── interface/                       # Web application (presentation layer)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── inspiration/                 # Brand assets, screenshots from leplaylaw.com
│
├── agents/                          # One folder per agent — debugging hub
│   ├── rag-query/
│   │   └── README.md                # Links workflow + tool, status, known issues
│   ├── draft-letter/
│   │   └── README.md
│   ├── summarize-document/
│   │   └── README.md
│   ├── generate-invoice/
│   │   └── README.md
│   ├── prepare-hearing/
│   │   └── README.md
│   └── generate-content/
│       └── README.md
│
├── workflows/                       # WAT Layer 1 — Markdown SOPs
│   ├── rag_query.md
│   ├── draft_letter.md
│   ├── summarize_document.md
│   ├── generate_invoice.md
│   ├── prepare_hearing.md
│   └── generate_content.md
│
├── tools/                           # WAT Layer 3 — Python execution scripts
│   ├── ollama_client.py             # Shared Ollama client (used by all agents)
│   ├── query_documents.py
│   ├── index_documents.py
│   ├── generate_document.py
│   ├── summarize_document.py
│   ├── generate_invoice.py
│   ├── prepare_hearing.py
│   └── generate_content.py
│
└── data/
    ├── index/                       # Vector index of RAG documents
    └── templates/                   # Document templates (invoices, letters)
```

---

## Scope

This spec covers **structure only** — empty files and folders. No content is written yet. Each layer will be filled in separately:

- `workflows/` — filled when defining each agent's SOP
- `tools/` — filled when implementing each agent's Python script
- `agents/README.md` files — filled as agents are built and debugged
- `interface/` — filled when building the web UI (inspired by assets in `inspiration/`)

---

## Key Principles Preserved

- **WAT separation:** Workflows, Tools, and the interface remain in distinct layers
- **Locality:** Everything runs on Errol's Mac Mini — no external services
- **Language rule:** Code/comments in English, all user-facing content in French
- **Debuggability:** `agents/<name>/` is the single place to investigate any broken agent
- **Modularity:** Adding a new agent = new folder in `agents/` + one workflow + one tool
