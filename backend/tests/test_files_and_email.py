"""Tests for bug fix: GET /api/files/{id} should serve soft-deleted files.
Also regression tests for send-email + settings endpoints."""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

# Minimal valid 1x1 PNG
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
    b"\xc0\x00\x00\x00\x03\x00\x01\x5b\x8a\x9d\xd1\x00\x00\x00\x00IEND\xaeB`\x82"
)

SOFT_DELETED_FILE_ID = "5aab7cea-a4c4-4a56-96c9-dbf1da9d2395"


# ---------- BUG FIX: soft-deleted file still downloadable ----------
def test_get_soft_deleted_file_returns_200():
    r = requests.get(f"{API}/files/{SOFT_DELETED_FILE_ID}", timeout=30)
    assert r.status_code == 200, f"Expected 200 for soft-deleted file, got {r.status_code}: {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("image/png"), r.headers.get("content-type")
    cd = r.headers.get("content-disposition", "")
    assert "inline" in cd.lower()
    assert "t.png" in cd
    assert len(r.content) > 0


def test_get_nonexistent_file_returns_404():
    r = requests.get(f"{API}/files/does-not-exist-xyz-123", timeout=30)
    assert r.status_code == 404
    assert r.json().get("detail") == "Arquivo não encontrado"


# ---------- REGRESSION: upload -> record -> send-email -> delete -> file still works ----------
@pytest.fixture(scope="module")
def uploaded_file():
    files = {"file": ("regress.png", io.BytesIO(PNG_BYTES), "image/png")}
    r = requests.post(f"{API}/uploads", files=files, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def created_record(uploaded_file):
    payload = {
        "cnpj": "33000167000101",
        "company_name": "PETROBRAS TEST",
        "cte_number": "REG-TEST-001",
        "payment_value": 1500.50,
        "receipts": [{
            "id": uploaded_file["id"],
            "storage_path": uploaded_file["storage_path"],
            "original_filename": uploaded_file["original_filename"],
            "content_type": uploaded_file["content_type"],
            "size": uploaded_file["size"],
        }],
        "notes": "regression",
    }
    r = requests.post(f"{API}/records", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_send_email_single_recipient(created_record):
    r = requests.post(
        f"{API}/records/{created_record['id']}/send-email",
        json={"to": "delivered@resend.dev", "message": "regression", "attach_receipts": True},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("attachments_count", 0) >= 1, data
    assert data.get("download_links_count", 0) >= 1, data


def test_send_email_multi_recipients(created_record):
    r = requests.post(
        f"{API}/records/{created_record['id']}/send-email",
        json={
            "to": "delivered@resend.dev,luis.ribeiro@alfatransportes.com.br,matheus.goes@alfatransportes.com.br",
            "message": "multi",
            "attach_receipts": False,
        },
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    recipients = data.get("recipients") or []
    assert len(recipients) == 3, f"Expected 3 recipients, got {recipients}"


def test_delete_record_then_file_still_downloadable(created_record, uploaded_file):
    # Delete record
    r = requests.delete(f"{API}/records/{created_record['id']}", timeout=30)
    assert r.status_code == 200, r.text
    # File should still be downloadable (soft-delete only)
    r2 = requests.get(f"{API}/files/{uploaded_file['id']}", timeout=30)
    assert r2.status_code == 200, f"File download after delete failed: {r2.status_code} {r2.text[:200]}"
    assert r2.headers.get("content-type", "").startswith("image/png")
    assert len(r2.content) > 0


# ---------- REGRESSION: Settings ----------
def test_get_settings_new_format():
    r = requests.get(f"{API}/settings", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "default_recipients" in data
    assert isinstance(data["default_recipients"], list)
    assert "default_subject_template" in data
    assert isinstance(data["default_subject_template"], str)


def test_put_settings_list_recipients():
    payload = {"default_recipients": ["a@a.com", "b@b.com"], "default_subject_template": "CT-e {cte} - {company}"}
    r = requests.put(f"{API}/settings", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["default_recipients"] == ["a@a.com", "b@b.com"]
    # Verify persistence
    r2 = requests.get(f"{API}/settings", timeout=30)
    assert r2.json()["default_recipients"] == ["a@a.com", "b@b.com"]
