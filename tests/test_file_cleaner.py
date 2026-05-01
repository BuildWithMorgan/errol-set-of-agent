import json
import pytest
from pathlib import Path
from tools.file_cleaner import get_files_to_scan, classify_file, scan_folders, extract_text

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


def test_classify_file_parses_valid_ollama_response(tmp_path, monkeypatch):
    from unittest.mock import MagicMock
    mock_response = MagicMock()
    mock_response.json.return_value = {"response": json.dumps(MOCK_CLASSIFICATION)}
    mock_response.raise_for_status = lambda: None
    monkeypatch.setattr("httpx.post", lambda *a, **kw: mock_response)
    f = tmp_path / "contrat_dupont.pdf"
    f.touch()
    result = classify_file(f)
    assert result["action"] == "rename_and_move"
    assert result["client"] == "Dupont"


def test_get_files_to_scan_excludes_old_files(tmp_path):
    import os, time
    old_file = tmp_path / "old.pdf"
    old_file.touch()
    old_mtime = time.time() - (40 * 86400)
    os.utime(old_file, (old_mtime, old_mtime))
    files = get_files_to_scan([str(tmp_path)], max_age_days=30)
    assert old_file not in files


def test_extract_text_from_txt(tmp_path):
    f = tmp_path / "note.txt"
    f.write_text("Facture du 01/04/2026 — Client Racon", encoding="utf-8")
    result = extract_text(f)
    assert "Facture" in result
    assert "Racon" in result


def test_extract_text_returns_empty_for_image(tmp_path):
    f = tmp_path / "photo.jpg"
    f.write_bytes(b"\xff\xd8\xff")  # minimal JPEG header
    result = extract_text(f)
    assert result == ""


def test_extract_text_returns_empty_on_corrupt_pdf(tmp_path):
    f = tmp_path / "broken.pdf"
    f.write_bytes(b"not a real pdf")
    result = extract_text(f)
    assert result == ""
