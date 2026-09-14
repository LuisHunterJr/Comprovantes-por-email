# PRD - Painel CT-e & Comprovantes de Pagamento

## Original Problem Statement
"Faça um painel, que eu possa cadastrar CNPJ e ele consultar o nome e preencher automático o nome, e colocar o número do CTe bem destacado, e pode anexar até 5 comprovantes de pagamentos"

## User Choices
- CNPJ lookup: BrasilAPI (gratuita)
- Storage: Emergent Object Storage
- Auth: Sem autenticação
- Campos: CNPJ, Nome (Razão Social), CT-e, Comprovantes, Valor de Pagamento

## Architecture
- Backend: FastAPI + MongoDB (motor). Endpoints: /api/cnpj/{cnpj}, /api/uploads, /api/files/{id}, /api/records (CRUD), /api/stats
- Frontend: React 19 + Tailwind + shadcn/ui + framer-motion + sonner
- Object Storage: Emergent proxy (via EMERGENT_LLM_KEY)
- CNPJ lookup: BrasilAPI

## Implemented (2026-02)
- CNPJ auto-lookup with mask + auto-fill razão social
- Prominent CT-e highlight card (indigo gradient, monospace, barcode ornament, copy button, scanline)
- Payment value input (BRL) with quick amount buttons
- Multi-file upload (max 5, PDF/PNG/JPG/WEBP up to 15MB) with dropzone, previews, remove
- Records table with search, delete confirmation, receipt preview modal
- KPI cards (total CT-e, valor total pago, comprovantes, média)

## Backlog / Next
- P1: Editar registro existente
- P1: Filtro de data e status pago/pendente
- P2: Exportação CSV/PDF
- P2: Dashboard analítico (gráficos)
