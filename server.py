import asyncio
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

_history_lock = asyncio.Lock()

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
                        "output": output_text,
                        "created_at": datetime.now().isoformat(),
                    })
                    write_json(HISTORY_FILE, history)

    return StreamingResponse(stream_and_save(), media_type="text/plain")

# ─── History ──────────────────────────────────────────────────────────────────

@app.get("/api/history")
def get_history(agent: str = None, limit: int = 20):
    history = read_json(HISTORY_FILE)
    if agent:
        history = [h for h in history if h["agent"] == agent]
    return history[:limit]

# ─── Templates stub (full implementation in Task 4) ───────────────────────────

@app.get("/api/templates")
def get_templates(agent: str = None):
    templates = read_json(TEMPLATES_FILE)
    if agent:
        templates = [t for t in templates if t["agent"] == agent]
    return templates

# ─── Static files (must come last so /api routes are matched first) ───────────

app.mount("/", StaticFiles(directory="interface", html=True), name="static")
