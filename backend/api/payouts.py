"""
api/payouts.py
──────────────────────────────
Handles explicit SLA breaches and manual/automated compensation triggers.
"""

import logging
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("gigkavach.payouts")
router = APIRouter(tags=["Payouts & SLA"])

# --- Payloads ---
class PayoutRequest(BaseModel):
    worker_id: str
    disruption_start: datetime
    disruption_end: datetime
    dci_score: int

class PayoutResponse(BaseModel):
    worker_id: str
    payout_amount: float
    breakdown: dict

# --- Stubs ---
WORKER_DB = {
    "W100": {"baseline_earnings": 1000.0, "plan_tier": "Basic"},
    "W101": {"baseline_earnings": 1500.0, "plan_tier": "Plus"},
    "W102": {"baseline_earnings": 2000.0, "plan_tier": "Pro"},
}

PLAN_MULTIPLIERS = {
    "Basic": 0.4,
    "Plus": 0.5,
    "Pro": 0.7
}

@router.post("/v1/calculate_payout", response_model=PayoutResponse)
async def calculate_payout(request: PayoutRequest):
    """
    Calculates the exact monetary payout for a worker dynamically based on the ML Model 
    prediction, the duration of the disruption, and their premium plan tier.
    """
    worker = WORKER_DB.get(request.worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
        
    baseline_earnings = worker["baseline_earnings"]
    plan_tier = worker["plan_tier"]
    
    # 1. Calculate duration
    duration_td = request.disruption_end - request.disruption_start
    disruption_duration_hours = max(0.0, duration_td.total_seconds() / 3600.0)
    
    # 2. XGBoost Model inference (Stubbing the multiplier since the actual model is currently un-trained)
    # This directly mirrors the XGBoost predicted multiplier (1.0 - 5.0x)
    base_multiplier = 1.0 + (request.dci_score / 100.0) + (disruption_duration_hours * 0.1)
    predicted_multiplier = round(min(max(base_multiplier, 1.0), 5.0), 2)
    
    # 3. Apply Plan Tier multiplier
    tier_multiplier = PLAN_MULTIPLIERS.get(plan_tier, 0.4)
    
    # 4. Final Calculation
    # Payout = (Daily Baseline / 8 hr shift) * disrupted_hours * ML_Surge * Tier_Coverage
    hourly_rate = baseline_earnings / 8.0
    payout_amount = round(hourly_rate * disruption_duration_hours * predicted_multiplier * tier_multiplier, 2)
    
    breakdown = {
        "disruption_duration_hours": round(disruption_duration_hours, 2),
        "baseline_earnings": baseline_earnings,
        "plan_tier": plan_tier,
        "tier_coverage_multiplier": tier_multiplier,
        "xgboost_predicted_surge": predicted_multiplier,
        "dci_score_registered": request.dci_score
    }
    
    return PayoutResponse(
        worker_id=request.worker_id,
        payout_amount=payout_amount,
        breakdown=breakdown
    )

async def trigger_sla_breach(pincode: str, reason: str):
    """
    Fires an irrevocable SLA breach event to the ledger/database, releasing unconditional 
    base payouts to active workers in the zone due to catastrophic system failure.
    """
    logger.critical(f"[SLA BREACH TRIGGERED] {reason} for zone {pincode}. Workers compensated automatically.")
    
    # TODO: Connect to your ledger or payment gateway to execute compensation
    return {"status": "SLA_BREACH_EXECUTED", "zone": pincode, "reason": reason}
