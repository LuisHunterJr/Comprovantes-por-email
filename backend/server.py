from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Response, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import uuid
import base64
import ipaddress
import httpx
import requests
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Emergent Object Storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "cte-panel"
_storage_key: Optional[str] = None

# Emergent Email (Resend managed)
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Painel CT-e")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
}

app = FastAPI()
api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key}, timeout=60
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- Models ----------
class Receipt(BaseModel):
    id: str
    storage_path: str
    original_filename: str
    content_type: str
    size: int


class RecordCreate(BaseModel):
    cnpj: str
    company_name: str
    cte_number: str
    payment_value: float
    receipts: List[Receipt] = []
    notes: Optional[str] = None


class Record(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cnpj: str
    company_name: str
    cte_number: str
    payment_value: float
    receipts: List[Receipt] = []
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------- Helpers ----------
def clean_cnpj(cnpj: str) -> str:
    return re.sub(r"\D", "", cnpj or "")


# ---------- Endpoints ----------
@api_router.get("/")
async def root():
    return {"message": "CTe Painel API", "status": "ok"}


@api_router.get("/cnpj/{cnpj}")
async def lookup_cnpj(cnpj: str):
    """Consulta CNPJ na BrasilAPI e retorna razão social."""
    c = clean_cnpj(cnpj)
    if len(c) != 14:
        raise HTTPException(status_code=400, detail="CNPJ deve conter 14 dígitos")
    try:
        r = requests.get(f"https://brasilapi.com.br/api/cnpj/v1/{c}", timeout=15)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar BrasilAPI: {e}")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="CNPJ não encontrado na Receita Federal")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail="Falha na consulta do CNPJ")
    data = r.json()
    return {
        "cnpj": c,
        "razao_social": data.get("razao_social") or data.get("nome") or "",
        "nome_fantasia": data.get("nome_fantasia") or "",
        "situacao_cadastral": data.get("descricao_situacao_cadastral") or data.get("situacao") or "",
        "municipio": data.get("municipio") or "",
        "uf": data.get("uf") or "",
    }


@api_router.post("/uploads")
async def upload_file(file: UploadFile = File(...)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin").lower()
    allowed = {"pdf", "png", "jpg", "jpeg", "webp"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não permitido: {ext}")
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Arquivo maior que 15MB")
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/receipts/{file_id}.{ext}"
    ct = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    try:
        result = put_object(path, content, ct)
    except Exception as e:
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail=f"Falha no upload: {e}")
    doc = {
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename or f"arquivo.{ext}",
        "content_type": ct,
        "size": result.get("size", len(content)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(doc)
    return {
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": doc["original_filename"],
        "content_type": ct,
        "size": doc["size"],
    }


@api_router.get("/files/{file_id}")
async def download_file(file_id: str):
    doc = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    data, ct = get_object(doc["storage_path"])
    return Response(
        content=data,
        media_type=doc.get("content_type", ct),
        headers={"Content-Disposition": f'inline; filename="{doc["original_filename"]}"'},
    )


@api_router.post("/records", response_model=Record)
async def create_record(payload: RecordCreate):
    if len(payload.receipts) > 5:
        raise HTTPException(status_code=400, detail="Máximo de 5 comprovantes por registro")
    cnpj = clean_cnpj(payload.cnpj)
    if len(cnpj) != 14:
        raise HTTPException(status_code=400, detail="CNPJ inválido")
    record = Record(
        cnpj=cnpj,
        company_name=payload.company_name.strip(),
        cte_number=payload.cte_number.strip(),
        payment_value=float(payload.payment_value),
        receipts=payload.receipts,
        notes=payload.notes,
    )
    doc = record.model_dump()
    await db.records.insert_one(doc)
    return record


@api_router.get("/records", response_model=List[Record])
async def list_records(q: Optional[str] = Query(None)):
    filt = {}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        filt = {"$or": [{"cnpj": rx}, {"company_name": rx}, {"cte_number": rx}]}
    docs = await db.records.find(filt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.get("/records/{record_id}", response_model=Record)
async def get_record(record_id: str):
    doc = await db.records.find_one({"id": record_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    return doc


@api_router.delete("/records/{record_id}")
async def delete_record(record_id: str):
    doc = await db.records.find_one({"id": record_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    # Soft-delete receipts
    for r in doc.get("receipts", []):
        await db.files.update_one({"id": r["id"]}, {"$set": {"is_deleted": True}})
    await db.records.delete_one({"id": record_id})
    return {"ok": True}


# ---------- Settings (single doc) ----------
SETTINGS_ID = "singleton"


class Settings(BaseModel):
    default_recipient: Optional[EmailStr] = None
    default_subject_template: str = "CT-e {cte} - {company}"


@api_router.get("/settings", response_model=Settings)
async def get_settings():
    doc = await db.settings.find_one({"_id": SETTINGS_ID}, {"_id": 0})
    return doc or Settings().model_dump()


@api_router.put("/settings", response_model=Settings)
async def update_settings(payload: Settings):
    data = payload.model_dump()
    await db.settings.update_one({"_id": SETTINGS_ID}, {"$set": data}, upsert=True)
    return payload


# ---------- Email guardrail gate (playbook, verbatim) ----------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def _resend_send(to: str, subject: str, html: str, attachments: List[dict], reply_to: Optional[str]) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {
        "to": [to],
        "subject": subject,
        "html": html,
        "from_name": EMAIL_FROM_NAME,
    }
    if attachments:
        payload["attachments"] = attachments
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    async with httpx.AsyncClient(timeout=60) as clientx:
        resp = await clientx.post(
            f"{EMAIL_BASE_URL}/api/v1/email/send",
            headers={"X-Email-Key": EMAIL_KEY},
            json=payload,
        )
    if resp.status_code >= 400:
        logger.error(f"Email send failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=502, detail=f"Falha no envio ({resp.status_code}): {resp.text[:200]}")
    try:
        return resp.json().get("id")
    except Exception:
        return None


class SendEmailPayload(BaseModel):
    to: EmailStr
    message: Optional[str] = None
    attach_receipts: bool = True


def _mask_cnpj_pt(cnpj: str) -> str:
    c = re.sub(r"\D", "", cnpj or "")
    if len(c) != 14:
        return cnpj
    return f"{c[0:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:14]}"


def _format_brl(v: float) -> str:
    s = f"{v:,.2f}"
    # en-US -> pt-BR
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def _build_email_html(record: dict, message: Optional[str], attachments_count: int) -> str:
    company = escape(record.get("company_name", ""))
    cnpj = escape(_mask_cnpj_pt(record.get("cnpj", "")))
    cte = escape(record.get("cte_number", ""))
    valor = escape(_format_brl(float(record.get("payment_value", 0))))
    notes = escape(record.get("notes") or "")
    msg_html = f'<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6">{escape(message)}</p>' if message else ""
    notes_row = (
        f'<tr><td style="padding:8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;width:150px">Observações</td>'
        f'<td style="padding:8px 0;color:#0f172a;font-size:14px">{notes}</td></tr>'
    ) if notes else ""
    attach_html = (
        f'<p style="margin:16px 0 0;color:#64748b;font-size:12px">Comprovantes anexados: <strong>{attachments_count}</strong></p>'
        if attachments_count else
        '<p style="margin:16px 0 0;color:#64748b;font-size:12px">Nenhum comprovante anexado neste envio.</p>'
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;font-family:Arial,Helvetica,sans-serif">'
        f'<tr><td align="center">'
        f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">'
        f'<tr><td style="background:#1E1B4B;padding:20px 24px">'
        f'<div style="color:#A5B4FC;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;font-weight:700">Conhecimento de Transporte Eletrônico</div>'
        f'<div style="color:#F1F5F9;font-size:32px;font-weight:800;letter-spacing:0.08em;font-family:Consolas,Menlo,monospace;margin-top:6px">CT-e {cte}</div>'
        f'</td></tr>'
        f'<tr><td style="padding:24px">'
        f'{msg_html}'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
        f'<tr><td style="padding:8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;width:150px">Empresa</td>'
        f'<td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600">{company}</td></tr>'
        f'<tr><td style="padding:8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em">CNPJ</td>'
        f'<td style="padding:8px 0;color:#0f172a;font-size:14px;font-family:Consolas,Menlo,monospace">{cnpj}</td></tr>'
        f'<tr><td style="padding:8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em">Valor do pagamento</td>'
        f'<td style="padding:8px 0;color:#059669;font-size:16px;font-weight:700">{valor}</td></tr>'
        f'{notes_row}'
        f'</table>'
        f'{attach_html}'
        f'</td></tr>'
        f'<tr><td style="padding:16px 24px;background:#f1f5f9;color:#94a3b8;font-size:11px">'
        f'Enviado por {escape(EMAIL_FROM_NAME)}. Este é um e-mail transacional automático.'
        f'</td></tr>'
        f'</table>'
        f'</td></tr></table>'
    )


@api_router.post("/records/{record_id}/send-email")
async def send_record_email(record_id: str, payload: SendEmailPayload):
    if not EMAIL_KEY:
        raise HTTPException(status_code=500, detail="Serviço de e-mail não configurado")
    record = await db.records.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    attachments = []
    total_size = 0
    if payload.attach_receipts:
        for r in (record.get("receipts") or []):
            file_doc = await db.files.find_one({"id": r.get("id"), "is_deleted": False}, {"_id": 0})
            if not file_doc:
                continue
            try:
                data, _ct = get_object(file_doc["storage_path"])
            except Exception as e:
                logger.error(f"Skipping attachment {r.get('id')}: {e}")
                continue
            total_size += len(data)
            if total_size > 20 * 1024 * 1024:
                logger.warning("Anexos excedem 20MB — parando de anexar")
                break
            attachments.append({
                "filename": file_doc.get("original_filename") or f"comprovante-{r.get('id')}.bin",
                "content": base64.b64encode(data).decode("ascii"),
            })

    subject = f"CT-e {record.get('cte_number','')} - {record.get('company_name','')}"[:150]
    html = _build_email_html(record, payload.message, len(attachments))
    email_id = await _resend_send(
        to=payload.to,
        subject=subject,
        html=html,
        attachments=attachments,
        reply_to=EMAIL_REPLY_TO,
    )

    # Save recipient as default if none saved yet
    existing = await db.settings.find_one({"_id": SETTINGS_ID}, {"_id": 0})
    if not existing or not existing.get("default_recipient"):
        await db.settings.update_one(
            {"_id": SETTINGS_ID},
            {"$set": {"default_recipient": payload.to}},
            upsert=True,
        )

    return {
        "ok": True,
        "email_id": email_id,
        "attachments_count": len(attachments),
        "to": payload.to,
    }


@api_router.get("/stats")
async def stats():
    docs = await db.records.find({}, {"_id": 0}).to_list(10000)
    total = len(docs)
    valor = sum(d.get("payment_value", 0) for d in docs)
    receipts_count = sum(len(d.get("receipts", [])) for d in docs)
    avg = (valor / total) if total else 0
    return {
        "total_records": total,
        "total_value": round(valor, 2),
        "total_receipts": receipts_count,
        "average_value": round(avg, 2),
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Emergent object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
