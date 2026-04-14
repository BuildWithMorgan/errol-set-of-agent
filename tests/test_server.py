import json
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
