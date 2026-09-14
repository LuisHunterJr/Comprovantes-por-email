from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Response, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import uuid
import requests
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
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
