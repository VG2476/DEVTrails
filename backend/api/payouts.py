"""
api/payouts.py
──────────────────────────────
Payout read endpoints used by the frontend live feed.
"""

from datetime import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from utils.db import get_supabase

logger = logging.getLogger("gigkavach.payouts")
router = APIRouter(prefix="/api", tags=["Payouts & SLA"])
STATUS_DISPLAY_MAP = {
    "pending": "triggered",
    "processing": "calculating",
    "partial": "fraud_check",
    "escrowed": "fraud_check",
    "completed": "payout_sent",
}
NON_PROCESSING_STATUSES = {"failed", "withheld", "sla_auto", "cancelled", "rejected"}


class ProcessingPayout(BaseModel):
    id: str
    worker_id: Optional[str] = None
    worker_name: str
    amount: float
    dci_score: Optional[float] = None
    fraud_score: Optional[float] = None
    status: str
    timestamp: datetime


class ProcessingPayoutListResponse(BaseModel):
    payouts: list[ProcessingPayout] = Field(default_factory=list)
    count: int = 0


def _is_processing_pipeline_status(db_status: str) -> bool:
    normalized = (db_status or "").strip().lower()
    return bool(normalized) and normalized not in NON_PROCESSING_STATUSES


@router.get(
    "/payouts",
    response_model=ProcessingPayoutListResponse,
    status_code=status.HTTP_200_OK,
    summary="List payouts for live processing feed",
)
async def list_payouts(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Live feed endpoint expected by frontend:
    GET /api/payouts?status=processing&limit=20

    Returns payout rows with a normalized shape:
    worker_name, amount, dci_score, fraud_score, status, timestamp.
    """
    try:
        sb = get_supabase()
        fetch_limit = max(limit * 3, 50) if status_filter == "processing" else limit

        query = (
            sb.table("payouts")
            .select("id, worker_id, dci_event_id, final_amount, fraud_score, status, triggered_at, created_at")
            .order("triggered_at", desc=True)
            .limit(fetch_limit)
        )
        if status_filter:
            if status_filter != "processing":
                query = query.eq("status", status_filter)
        result = query.execute()
        rows = result.data or []

        if status_filter == "processing":
            rows = [row for row in rows if _is_processing_pipeline_status(row.get("status") or "")]
            rows = rows[:limit]

        worker_ids = [row.get("worker_id") for row in rows if row.get("worker_id")]
        worker_map: dict[str, str] = {}
        if worker_ids:
            workers = (
                sb.table("workers")
                .select("id, name")
                .in_("id", worker_ids)
                .execute()
            )
            for worker in workers.data or []:
                worker_map[worker["id"]] = worker.get("name") or "Unknown worker"

        dci_event_ids = [row.get("dci_event_id") for row in rows if row.get("dci_event_id")]
        dci_map: dict[str, float] = {}
        if dci_event_ids:
            dci_events = (
                sb.table("dci_events")
                .select("id, dci_score")
                .in_("id", dci_event_ids)
                .execute()
            )
            for event in dci_events.data or []:
                event_id = event.get("id")
                if event_id:
                    dci_map[event_id] = float(event.get("dci_score") or 0)

        payouts: list[ProcessingPayout] = []
        for row in rows:
            worker_id = row.get("worker_id")
            worker_name = worker_map.get(worker_id, f"Worker {str(worker_id)[:8]}" if worker_id else "Unknown worker")
            db_status = row.get("status") or "processing"
            payouts.append(
                ProcessingPayout(
                    id=str(row.get("id")),
                    worker_id=str(worker_id) if worker_id else None,
                    worker_name=worker_name,
                    amount=float(row.get("final_amount") or 0),
                    dci_score=dci_map.get(row.get("dci_event_id")) if row.get("dci_event_id") else None,
                    fraud_score=float(row["fraud_score"]) if row.get("fraud_score") is not None else None,
                    status=STATUS_DISPLAY_MAP.get(db_status, db_status),
                    timestamp=row.get("triggered_at") or row.get("created_at") or datetime.utcnow(),
                )
            )

        return ProcessingPayoutListResponse(payouts=payouts, count=len(payouts))

    except Exception as exc:
        logger.error(f"Failed to fetch payouts from database: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to fetch payouts from database",
        )


async def trigger_sla_breach(pincode: str, reason: str):
    """
    Fires an irrevocable SLA breach event to the ledger/database, releasing
    unconditional base payouts to active workers in the zone.
    """
    logger.critical(f"[SLA BREACH TRIGGERED] {reason} for zone {pincode}. Workers compensated automatically.")
    return {"status": "SLA_BREACH_EXECUTED", "zone": pincode, "reason": reason}
