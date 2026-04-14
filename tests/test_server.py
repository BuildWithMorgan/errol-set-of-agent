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
