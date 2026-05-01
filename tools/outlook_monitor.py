import os
import uuid
from datetime import datetime, timezone

import httpx


def is_configured() -> bool:
    return all([
        os.getenv("OUTLOOK_CLIENT_ID"),
        os.getenv("OUTLOOK_CLIENT_SECRET"),
        os.getenv("OUTLOOK_TENANT_ID"),
        os.getenv("OUTLOOK_USER_EMAIL"),
    ])


def get_access_token() -> str:
    tenant = os.getenv("OUTLOOK_TENANT_ID")
    resp = httpx.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={
            "grant_type": "client_credentials",
            "client_id": os.getenv("OUTLOOK_CLIENT_ID"),
            "client_secret": os.getenv("OUTLOOK_CLIENT_SECRET"),
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_emails_with_attachments(since: datetime = None) -> list:
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    filter_parts = ["hasAttachments eq true"]
    if since:
        ts = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        filter_parts.append(f"receivedDateTime ge {ts}")

    resp = httpx.get(
        f"https://graph.microsoft.com/v1.0/users/{os.getenv('OUTLOOK_USER_EMAIL')}/messages",
        headers=headers,
        params={
            "$filter": " and ".join(filter_parts),
            "$select": "id,subject,from,receivedDateTime,hasAttachments",
            "$expand": "attachments($select=name,size)",
            "$top": 20,
            "$orderby": "receivedDateTime desc",
        },
        timeout=15.0,
    )
    resp.raise_for_status()

    results = []
    for msg in resp.json().get("value", []):
        results.append({
            "id": msg["id"],
            "subject": msg["subject"],
            "sender": msg["from"]["emailAddress"]["name"],
            "received_at": msg["receivedDateTime"],
            "attachments": [a["name"] for a in msg.get("attachments", [])],
        })
    return results


def scan_emails(since: datetime = None, known_ids: set = None) -> list:
    if not is_configured():
        return []
    if known_ids is None:
        known_ids = set()

    try:
        emails = get_emails_with_attachments(since)
    except Exception:
        return []

    proposals = []
    for email in emails:
        if email["id"] in known_ids:
            continue
        attach_summary = ", ".join(email["attachments"][:3])
        count = len(email["attachments"])
        proposals.append({
            "id": uuid.uuid4().hex,
            "detected_at": datetime.now().isoformat(timespec="seconds"),
            "source": "email",
            "status": "pending",
            "original_path": email["id"],
            "proposed_name": None,
            "proposed_destination": None,
            "action": "email_flag",
            "ai_reason": f"{email['sender']} — {count} pièce(s) jointe(s) : {attach_summary}",
            "email_meta": {
                "subject": email["subject"],
                "sender": email["sender"],
                "received_at": email["received_at"],
                "attachments": email["attachments"],
            },
        })
    return proposals
