import json
from pathlib import Path
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_status_online():
    mock_response = AsyncMock()
    mock_response.status_code = 200

    with patch("server.httpx.AsyncClient") as mock_client_class:
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_cm
        response = client.get("/api/status")

    assert response.status_code == 200
    assert response.json()["online"] is True
    assert "model" in response.json()


def test_status_offline():
    with patch("server.httpx.AsyncClient") as mock_client_class:
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value.get = AsyncMock(side_effect=Exception("refused"))
        mock_client_class.return_value = mock_cm
        response = client.get("/api/status")

    assert response.status_code == 200
    assert response.json()["online"] is False


def test_get_history_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text("[]")
    response = client.get("/api/history")
    assert response.status_code == 200
    assert response.json() == []


def test_get_history_filters_by_agent(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text(json.dumps([
        {"id": "1", "agent": "letter", "agent_label": "Rédiger", "input": "x", "output": "y", "created_at": "2026-01-01"},
        {"id": "2", "agent": "invoice", "agent_label": "Facture", "input": "a", "output": "b", "created_at": "2026-01-02"},
    ]))
    response = client.get("/api/history?agent=letter")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["agent"] == "letter"


def test_get_history_limit(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    entries = [{"id": str(i), "agent": "rag", "agent_label": "RAG", "input": "q", "output": "a", "created_at": "2026-01-01"} for i in range(15)]
    (tmp_path / "history.json").write_text(json.dumps(entries))
    response = client.get("/api/history?limit=5")
    assert len(response.json()) == 5


def test_create_template(tmp_path, monkeypatch):
    monkeypatch.setattr("server.TEMPLATES_FILE", tmp_path / "templates.json")
    (tmp_path / "templates.json").write_text("[]")
    response = client.post("/api/templates", json={
        "agent": "letter",
        "label": "Mise en demeure standard",
        "prompt": "Rédige une mise en demeure pour...",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["agent"] == "letter"
    assert "id" in data


def test_create_template_missing_fields(tmp_path, monkeypatch):
    monkeypatch.setattr("server.TEMPLATES_FILE", tmp_path / "templates.json")
    (tmp_path / "templates.json").write_text("[]")
    response = client.post("/api/templates", json={"agent": "letter"})
    assert response.status_code == 400


def test_delete_template(tmp_path, monkeypatch):
    monkeypatch.setattr("server.TEMPLATES_FILE", tmp_path / "templates.json")
    (tmp_path / "templates.json").write_text(json.dumps([
        {"id": "abc", "agent": "letter", "label": "Test", "prompt": "...", "created_at": "2026-01-01"}
    ]))
    response = client.delete("/api/templates/abc")
    assert response.status_code == 204
    remaining = json.loads((tmp_path / "templates.json").read_text())
    assert remaining == []


def test_delete_template_not_found(tmp_path, monkeypatch):
    monkeypatch.setattr("server.TEMPLATES_FILE", tmp_path / "templates.json")
    (tmp_path / "templates.json").write_text("[]")
    response = client.delete("/api/templates/nonexistent")
    assert response.status_code == 404


def test_post_feedback_up(tmp_path, monkeypatch):
    monkeypatch.setattr("server.FEEDBACK_FILE", tmp_path / "feedback.json")
    (tmp_path / "feedback.json").write_text("[]")
    response = client.post("/api/feedback", json={"agent": "letter", "rating": "up"})
    assert response.status_code == 201
    assert response.json()["rating"] == "up"


def test_post_feedback_invalid_rating(tmp_path, monkeypatch):
    monkeypatch.setattr("server.FEEDBACK_FILE", tmp_path / "feedback.json")
    (tmp_path / "feedback.json").write_text("[]")
    response = client.post("/api/feedback", json={"agent": "letter", "rating": "meh"})
    assert response.status_code == 400


def test_post_feedback_invalid_agent(tmp_path, monkeypatch):
    monkeypatch.setattr("server.FEEDBACK_FILE", tmp_path / "feedback.json")
    (tmp_path / "feedback.json").write_text("[]")
    response = client.post("/api/feedback", json={"agent": "unknown", "rating": "up"})
    assert response.status_code == 400


def test_export_pdf():
    response = client.post("/api/export", json={
        "content": "Ceci est un test de génération PDF.",
        "agent": "letter",
        "format": "pdf",
    })
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert b"%PDF" in response.content


def test_export_docx():
    response = client.post("/api/export", json={
        "content": "Ceci est un test de génération Word.",
        "agent": "invoice",
        "format": "docx",
    })
    assert response.status_code == 200
    assert "wordprocessingml" in response.headers["content-type"]
    assert response.content[:2] == b"PK"


def test_export_missing_content():
    response = client.post("/api/export", json={"agent": "letter", "format": "pdf"})
    assert response.status_code == 400


def test_export_invalid_format():
    response = client.post("/api/export", json={"content": "test", "agent": "letter", "format": "txt"})
    assert response.status_code == 400


def test_delete_history_entry(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text(json.dumps([
        {"id": "abc", "agent": "letter", "agent_label": "Rédiger un courrier", "input": "test", "output": "result", "created_at": "2026-01-01"},
        {"id": "xyz", "agent": "rag",    "agent_label": "Interroger mes dossiers", "input": "query", "output": "answer", "created_at": "2026-01-02"},
    ]))
    response = client.delete("/api/history/abc")
    assert response.status_code == 204
    remaining = json.loads((tmp_path / "history.json").read_text())
    assert len(remaining) == 1
    assert remaining[0]["id"] == "xyz"


def test_delete_history_entry_not_found(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text("[]")
    response = client.delete("/api/history/nonexistent")
    assert response.status_code == 404


def test_clear_history(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text(json.dumps([
        {"id": "1", "agent": "rag", "agent_label": "Interroger mes dossiers", "input": "q", "output": "a", "created_at": "2026-01-01"},
        {"id": "2", "agent": "letter", "agent_label": "Rédiger un courrier", "input": "x", "output": "y", "created_at": "2026-01-02"},
    ]))
    response = client.delete("/api/history")
    assert response.status_code == 204
    remaining = json.loads((tmp_path / "history.json").read_text())
    assert remaining == []
