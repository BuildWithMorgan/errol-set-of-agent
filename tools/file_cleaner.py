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
    r'(\s*\(\d+\)|\s*[-_\s]v\d+|\s*[-_\s]copie|\s*[-_]final|\s*[-_]old|\s*[-_]backup)',
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
    Rule-based only — no Ollama calls.
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
