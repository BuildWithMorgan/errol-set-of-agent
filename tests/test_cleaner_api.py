import pytest
from pathlib import Path
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_proposals(tmp_path, monkeypatch):
    proposals_file = tmp_path / "cleaner_proposals.json"
    settings_file = tmp_path / "cleaner_settings.json"
    monkeypatch.setattr("server.CLEANER_PROPOSALS_FILE", proposals_file)
    monkeypatch.setattr("server.CLEANER_SETTINGS_FILE", settings_file)
    yield


def test_get_proposals_empty():
    r = client.get("/api/cleaner/proposals")
    assert r.status_code == 200
    assert r.json() == []


def test_get_proposals_returns_pending_only(monkeypatch):
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
    settings_file = tmp_path / "cleaner_settings.json"
    monkeypatch.setattr("server.CLEANER_SETTINGS_FILE", settings_file)

    mock_scheduler = MagicMock()
    monkeypatch.setattr("server._scheduler", mock_scheduler)

    r = client.post("/api/cleaner/settings", json={"interval_minutes": 30})
    assert r.status_code == 200
    mock_scheduler.reschedule_job.assert_called_once_with(
        "cleaner_scan", trigger="interval", minutes=30
    )


def test_scan_endpoint_returns_started(monkeypatch):
    monkeypatch.setattr("server.run_scan", lambda: None)
    r = client.post("/api/cleaner/scan")
    assert r.status_code == 200
    assert r.json()["status"] == "started"


def test_settings_endpoint_round_trip(monkeypatch, tmp_path):
    settings_file = tmp_path / "cleaner_settings.json"
    monkeypatch.setattr("server.CLEANER_SETTINGS_FILE", settings_file)

    mock_scheduler = MagicMock()
    monkeypatch.setattr("server._scheduler", mock_scheduler)

    r = client.post("/api/cleaner/settings", json={"interval_minutes": 15})
    assert r.status_code == 200
    assert r.json()["interval_minutes"] == 15

    r2 = client.get("/api/cleaner/settings")
    assert r2.json()["interval_minutes"] == 15
