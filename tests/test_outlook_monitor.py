import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone


def test_is_configured_false_when_no_env(monkeypatch):
    monkeypatch.delenv("OUTLOOK_CLIENT_ID", raising=False)
    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)
    assert m.is_configured() is False


def test_scan_emails_returns_empty_when_not_configured(monkeypatch):
    monkeypatch.delenv("OUTLOOK_CLIENT_ID", raising=False)
    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)
    result = m.scan_emails()
    assert result == []


def test_scan_emails_skips_known_ids(monkeypatch):
    monkeypatch.setenv("OUTLOOK_CLIENT_ID", "fake-id")
    monkeypatch.setenv("OUTLOOK_CLIENT_SECRET", "fake-secret")
    monkeypatch.setenv("OUTLOOK_TENANT_ID", "fake-tenant")
    monkeypatch.setenv("OUTLOOK_USER_EMAIL", "errol@example.com")

    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)

    with patch.object(m, "get_access_token", return_value="token"), \
         patch.object(m, "get_emails_with_attachments", return_value=[
             {"id": "known-id", "subject": "Test", "sender": "Bob",
              "received_at": "2026-04-30T10:00:00Z", "attachments": ["doc.pdf"]}
         ]):
        result = m.scan_emails(known_ids={"known-id"})
    assert result == []


def test_scan_emails_returns_proposals(monkeypatch):
    monkeypatch.setenv("OUTLOOK_CLIENT_ID", "fake-id")
    monkeypatch.setenv("OUTLOOK_CLIENT_SECRET", "fake-secret")
    monkeypatch.setenv("OUTLOOK_TENANT_ID", "fake-tenant")
    monkeypatch.setenv("OUTLOOK_USER_EMAIL", "errol@example.com")

    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)

    with patch.object(m, "get_access_token", return_value="token"), \
         patch.object(m, "get_emails_with_attachments", return_value=[
             {"id": "msg-1", "subject": "Projet d'acte", "sender": "Cabinet Lefebvre",
              "received_at": "2026-04-30T09:47:00Z", "attachments": ["acte.pdf", "annexe.docx"]}
         ]):
        result = m.scan_emails()

    assert len(result) == 1
    p = result[0]
    assert p["source"] == "email"
    assert p["action"] == "email_flag"
    assert p["status"] == "pending"
    assert "Cabinet Lefebvre" in p["ai_reason"]
    assert p["email_meta"]["attachments"] == ["acte.pdf", "annexe.docx"]


def test_scan_emails_fails_silently_on_error(monkeypatch):
    monkeypatch.setenv("OUTLOOK_CLIENT_ID", "fake-id")
    monkeypatch.setenv("OUTLOOK_CLIENT_SECRET", "fake-secret")
    monkeypatch.setenv("OUTLOOK_TENANT_ID", "fake-tenant")
    monkeypatch.setenv("OUTLOOK_USER_EMAIL", "errol@example.com")

    from importlib import reload
    import tools.outlook_monitor as m
    reload(m)

    with patch.object(m, "get_access_token", side_effect=Exception("auth failed")):
        result = m.scan_emails()
    assert result == []
