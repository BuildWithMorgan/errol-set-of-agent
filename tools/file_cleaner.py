import io
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

REQUIRED_KEYS = {"client", "document_type", "legal_value", "proposed_name",
                 "proposed_subfolder", "reason", "action"}

VALID_ACTIONS = {"rename_and_move", "delete", "review_manually"}

TEXT_EXTRACTABLE = {".pdf", ".docx", ".txt"}
MAX_CONTENT_CHARS = 1500


def extract_text(file_path: Path) -> str:
    ext = file_path.suffix.lower()
    try:
        if ext == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_path.read_bytes()))
            text = "\n".join(page.extract_text() or "" for page in reader.pages[:3])
            return text[:MAX_CONTENT_CHARS].strip()
        if ext == ".docx":
            from docx import Document
            doc = Document(io.BytesIO(file_path.read_bytes()))
            text = "\n".join(p.text for p in doc.paragraphs)
            return text[:MAX_CONTENT_CHARS].strip()
        if ext == ".txt":
            return file_path.read_text(encoding="utf-8", errors="replace")[:MAX_CONTENT_CHARS].strip()
    except Exception:
        pass
    return ""


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
    content = extract_text(file_path) if file_path.suffix.lower() in TEXT_EXTRACTABLE else ""
    content_block = f"\nContenu extrait :\n{content}" if content else "\n(fichier non lisible — classement sur le nom uniquement)"

    prompt = f"""Tu es un assistant de gestion documentaire pour un cabinet d'avocats français.
Analyse ce fichier et génère une proposition de classement.

Nom du fichier : {file_path.name}
Dossier actuel : {file_path.parent.name}{content_block}

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
- proposed_name doit suivre le format YYYY-MM-DD_NomClient_Type.ext
- La date dans proposed_name doit être extraite du contenu du fichier (ex: date de la facture, date du contrat). Si introuvable, utilise la date du jour."""

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
        result = json.loads(raw[start:end])
        if not REQUIRED_KEYS.issubset(result.keys()):
            raise ValueError(f"Incomplete Ollama response, missing: {REQUIRED_KEYS - result.keys()}")
        return result
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


def scan_folders(folders: list, max_age_days: int = 30, known_paths: set = None, progress_cb=None) -> list:
    if known_paths is None:
        known_paths = set()

    onedrive = os.getenv("ONEDRIVE_PATH", str(Path.home() / "OneDrive"))
    proposals = []

    all_files = [f for f in get_files_to_scan(folders, max_age_days) if str(f) not in known_paths]
    total = len(all_files)

    for idx, file_path in enumerate(all_files, 1):
        if progress_cb:
            progress_cb(idx, total)
        classification = classify_file(file_path)
        if classification.get("action") not in VALID_ACTIONS:
            classification["action"] = "review_manually"
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
