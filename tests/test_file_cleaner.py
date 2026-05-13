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
