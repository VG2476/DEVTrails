# 🛡️ GigKavach - Quick Reference Guide

**Quick Links to Key Components**

---

## 🏗️ Architecture at a Glance

```
REQUEST FLOW:
User/Admin → React Frontend (Port 5173)
          → Axios HTTP calls
          → FastAPI Backend (Port 8000)
          → Supabase PostgreSQL
          → External APIs (Weather, AQI, Payments)

BACKGROUND JOBS:
Every 5 min  → DCI Poller (calculate disruption index)
Every 5 min  → Claims Trigger (create payouts for DCI ≥ 65)
Daily 11:55 PM → Settlement Service (fraud check + payout execution)
```

---

## 📂 Directory Map

| Path | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app + router registration |
| `backend/api/` | 8 API routers (auth, workers, policies, dci, fraud, payouts, etc.) |
| `backend/services/` | Business logic (fraud, DCI, payouts, weather, etc.) |
| `backend/ml/` | ML models (fraud detector, XGBoost, Isolation Forest) |
| `backend/database/` | Schema, migrations, seed data |
| `backend/cron/` | Background jobs (DCI poller, settlement, claims trigger) |
| `backend/utils/` | Helpers (DB, Redis, validators, geocoding) |
| `frontend/src/pages/` | Page components (Dashboard, Workers, Fraud, Payouts) |
| `frontend/src/components/` | Reusable UI components |
| `frontend/src/context/` | Global state (AuthContext) |
| `frontend/src/services/` | Supabase client, HTTP utilities |
| `models/fraud_detection_v2/` | Serialized ML models (.pkl files) |
| `data/` | CSV datasets for training/demo |

---

## 🔌 API Endpoints Summary

### Authentication
```
POST   /auth/login              → { access_token, refresh_token, user }
POST   /auth/refresh            → { access_token }
GET    /auth/me                 → { id, email, role } (requires Bearer token)
POST   /auth/logout             → (clears session)
```

### Workers
```
POST   /workers                 → Create new worker
GET    /workers                 → List all workers
GET    /workers/{worker_id}     → Get worker profile
PATCH  /workers/{worker_id}     → Update worker details
```

### DCI Engine
```
GET    /dci/{pincode}           → { current: {...}, history_24h: [...] }
GET    /dci/latest-alerts       → Top 4 high DCI zones
```

### Fraud Detection
```
POST   /check-fraud             → { is_fraud: bool, fraud_score, decision, ... }
```

### Payouts
```
GET    /payouts                 → List active/completed payouts
GET    /payouts?status=processing  → Live processing feed
```

### Policies
```
GET    /policies/{policy_id}    → Policy details
PATCH  /policies/{policy_id}    → Update plan/shift/zones
```

### Health
```
GET    /health                  → { status: "healthy" }
```

---

## 🎯 DCI Calculation Formula

```
DCI = (weather×0.30) + (aqi×0.20) + (heat×0.20) + (social×0.20) + (platform×0.10)

Each component: 0-100 score
Final DCI: 0-100 (clamped)

Severity Tiers:
  0-29   = "none"
  30-49  = "low"
  50-64  = "moderate"
  65-79  = "high"         ⚠️ CLAIMS TRIGGERED
  80-94  = "critical"
  ≥95    = "catastrophic"
```

---

## 🤖 Fraud Detection Pipeline (3-Stage)

```
STAGE 1: RULE-BASED (Hard blocks)
├─ Device farming (same device_id × 2+ workers)
├─ Rapid re-claim (claim within 6 hours)
├─ Zone density surge (5+ workers in 30 min)
└─ Threshold gaming (3+ claims near DCI 65-70)

If any rule triggers → fraud_score = 0.90 (HIGH confidence)

STAGE 2: ISOLATION FOREST (Unsupervised anomaly)
├─ 31 features: GPS, IP, history, timing, etc.
└─ Output: Anomaly score (0-1)

STAGE 3: XGBOOST (Supervised classifier)
├─ Same 31 features
└─ Output: Fraud probability (0-1)

ENSEMBLE:
If rules triggered    → fraud_score = 0.90
Else                  → fraud_score = (0.2 × IF_score) + (0.8 × XGB_score)

DECISION:
fraud_score > 0.50    → "BLOCK"     (0% payout)
fraud_score > 0.30    → "FLAG_50"   (50% payout, re-verify in 48h)
fraud_score ≤ 0.30    → "APPROVE"   (100% payout)
```

---

## 💰 Payout Calculation Formula

```
Base Payout = baseline_earnings × (disruption_duration_minutes / 480)

Multiplier = XGBoost_v3(dci_score, city, zone_density, shift, disruption_type, ...)
  Range: 1.0x - 5.0x

Final Payout = Base Payout × Multiplier

Example:
  baseline_earnings: ₹850/day
  disruption_duration: 240 min (4 hours)
  base_payout: 850 × (240/480) = ₹425
  multiplier: 1.5x (predicted by XGBoost)
  final_payout: ₹637.50 ✅
```

---

## 📊 Database Schema (Core Tables)

```sql
workers
├─ id (UUID)
├─ phone_number (unique)
├─ platform: 'zomato' | 'swiggy'
├─ plan: 'basic' (40% coverage) | 'plus' | 'pro' (70%)
├─ shift: 'morning' | 'night' | 'flexible'
├─ gig_score: Trust metric (0-100)
├─ coverage_active_from: 24h delay (moral hazard)
└─ is_active: Boolean

policies (weekly)
├─ id (UUID)
├─ worker_id (FK)
├─ plan: Snapshot of tier for this week
├─ status: 'active' | 'expired'
├─ week_start, week_end
├─ coverage_pct: 40 | 50 | 70
└─ premium_paid: ₹ amount for week

claims (triggered by DCI ≥ 65)
├─ id (UUID)
├─ worker_id (FK)
├─ dci_score: At trigger time
├─ disruption_type: 'Rain' | 'Heatwave' | 'Flood'
├─ disruption_duration: Minutes
├─ status: 'pending' → 'processing' → 'approved' → 'fraud_check' → 'completed'
├─ fraud_score, fraud_decision, is_fraud
├─ payout_amount, payout_multiplier
└─ created_at, processed_at

payouts (settlement record)
├─ id (UUID)
├─ worker_id (FK)
├─ claim_id (FK)
├─ base_amount, surge_multiplier, final_amount
├─ fraud_score
├─ status: 'pending' | 'processing' | 'completed'
└─ triggered_at, created_at
```

---

## 🔄 Background Job Schedule

### Every 5 Minutes: DCI Poller
```python
from cron/dci_poller.py

1. Fetch list of active zones & workers from DB
2. Call 5 external APIs:
   - Tomorrow.io: weather (rainfall)
   - AQICN/OpenAQ: air quality
   - Tomorrow.io: temperature
   - RSS Parser: social disruption (NLP)
   - Zomato/Swiggy: platform delivery blocks
3. Calculate DCI = weighted sum of components
4. Cache result in Redis (TTL: 30 min)
5. Log to Supabase dci_logs table
6. For each claim with DCI ≥ 65:
   - Create claim record
   - Notify worker via WhatsApp
   - Queue for fraud detection
```

### Every 5 Minutes: Claims Trigger
```python
from cron/claims_trigger.py

1. Identify zones where DCI ≥ 65 (from Redis cache)
2. Find eligible workers in those zones
3. Check eligibility:
   - Policy is active
   - Worker is in zone's pincode
   - Within shift window
   - 24h coverage activation delay satisfied
4. Create claim records (status='pending')
5. Send WhatsApp alert: "Disruption detected in your zone"
6. Queue for fraud check in settlement
```

### Daily at 11:55 PM: Settlement Service
```python
from cron/settlement_service.py

1. Fetch all claims with status='pending'
2. For each claim:
   a. Run fraud detection (3-stage pipeline)
   b. Get fraud_decision (APPROVE | FLAG_50 | BLOCK)
   c. Calculate payout multiplier (XGBoost)
   d. Calculate final_payout = base × multiplier
   e. Create payouts record
   f. Call Razorpay API to initiate UPI transfer
   g. Mark claim as 'processed'
3. Send WhatsApp confirmation:
   "Your payout of ₹XXX has been sent to your UPI"
4. Log settlement metrics
```

### Every 10 Minutes: Keep-Alive Ping
```python
from cron/keep_alive.py

GET /health
  ↓
Prevent Render free-tier cold starts
```

---

## 🛠️ Configuration (Environment Variables)

### Database
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
REDIS_URL=redis://localhost:6379/0
```

### External APIs
```env
TOMORROW_IO_API_KEY=...        # Weather & temperature
AQICN_API_TOKEN=...            # Air quality
OPENAQ_API_KEY=...             # Air quality (backup)
MAPPLS_API_KEY=...             # Geocoding
```

### Messaging & Payments
```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...
```

### App Configuration
```env
APP_ENV=production | development
DCI_POLL_INTERVAL_SECONDS=300   # 5 minutes
DCI_TRIGGER_THRESHOLD=65        # DCI ≥ 65 triggers claims
DCI_CATASTROPHIC_THRESHOLD=85
DCI_CACHE_TTL_SECONDS=1800      # 30 min
```

---

## 🚀 Deployment Checklist

**Before deploying to production**:

- [ ] All environment variables set (Render dashboard)
- [ ] Supabase database schema created
- [ ] Database migrations run
- [ ] ML models present in `models/fraud_detection_v2/`
- [ ] Twilio account configured
- [ ] Razorpay account configured
- [ ] Redis instance deployed (Redis Cloud or self-hosted)
- [ ] Frontend environment variables set (Vercel dashboard)
- [ ] CORS origins configured correctly
- [ ] Health check endpoint responding (GET /health)
- [ ] Database backups enabled (Supabase)
- [ ] Error logging configured (optional: Sentry)

---

## 🧪 Testing Commands

```bash
# Backend: Run smoke test (quick 5-second demo)
python backend/demo_claims_smoke_test.py

# Backend: Seed deterministic demo data
python backend/demo_dataset_seed.py

# Backend: Start dev server
cd backend
uvicorn main:app --reload --port 8000

# Frontend: Start dev server
cd frontend
npm run dev

# Frontend: Build for production
npm run build

# Frontend: Run tests
npm run test

# Frontend: Check code quality
npm run lint
```

---

## 🔐 Security Checklist

- [x] JWT validation on protected routes
- [x] CORS configured for frontend origin only
- [x] Environment variables not in git (.gitignore)
- [x] Pydantic validation prevents injection
- [x] Rate limiting: Consider adding on auth endpoints
- [x] IP allowlisting: Consider for admin endpoints
- [ ] Supabase RLS policies: Verify configured
- [ ] Database backups: Should be automated
- [ ] Secrets rotation: Implement periodic rotation

---

## 📞 Support & Troubleshooting

### Common Issues

**Backend won't start**
- Check Python 3.11+ installed
- Verify `.env` file exists with all required keys
- Check Supabase connection: `python backend/config/settings.py`

**Frontend shows API errors**
- Verify backend is running (check http://localhost:8000/health)
- Check CORS configuration in main.py
- Verify axios baseURL matches API endpoint

**DCI scores not updating**
- Check DCI poller job is running (APScheduler logs)
- Verify API keys for Tomorrow.io, AQICN, etc.
- Check Redis connection: `redis-cli ping`

**Fraud detection not triggering**
- Verify ML models exist: `ls models/fraud_detection_v2/`
- Check fraud_service logs for model loading errors
- Verify 31 features are being engineered correctly

**Payouts not settling**
- Check settlement service logs (11:55 PM)
- Verify Razorpay credentials
- Check claim status in Supabase claims table

---

## 📚 Key Files Reference

| File | Purpose | Key Function |
|------|---------|---|
| `main.py` | FastAPI app setup | `lifespan()` |
| `services/dci_engine.py` | DCI calculation | `calculate_dci()` |
| `services/fraud_service.py` | Fraud detection | `check_fraud()` |
| `services/payout_service.py` | Payout multiplier | `calculate_payout()` |
| `ml/fraud_detector.py` | 3-stage pipeline | `detect_fraud()` |
| `api/auth.py` | Authentication | `login()`, `verify_token()` |
| `cron/dci_poller.py` | 5-min DCI update | `run_dci_cycle()` |
| `cron/settlement_service.py` | Daily settlement | `run_daily_settlement()` |
| `database/schema.sql` | Database structure | Table creation |
| `frontend/context/AuthContext.jsx` | Auth state | `useAuth()` |
| `frontend/pages/Dashboard.jsx` | Admin dashboard | Main UI |

---

## 🎓 Learning Path for New Developers

**Week 1: Understand Architecture**
1. Read CODEBASE_DEEP_DIVE.md (you are here!)
2. Read README.md (project overview)
3. Explore main.py & understand FastAPI structure
4. Check docker-compose.yml for local dev setup

**Week 2: Backend Deep Dive**
1. Study DCI engine (services/dci_engine.py)
2. Study fraud detection (services/fraud_service.py)
3. Understand database schema (backend/database/schema.sql)
4. Review 1-2 critical API endpoints (e.g., fraud.py)

**Week 3: Frontend & Integration**
1. Explore React component structure
2. Understand AuthContext & state management
3. Review API service layer & Axios setup
4. Check Dashboard.jsx for real-world integration example

**Week 4: ML & Advanced Features**
1. Study fraud_detector.py (3-stage pipeline)
2. Review XGBoost v3 model training
3. Understand feature engineering
4. Explore payout multiplier prediction

**Month 2: Deployment & DevOps**
1. Set up Render account & configure backend
2. Set up Vercel account & configure frontend
3. Configure environment variables
4. Practice blue-green deployment strategy

---

## 📊 Production Metrics to Monitor

- **DCI Poller**: Latency (target <30s), API failure rate
- **Claim Trigger**: Claims created per DCI event
- **Fraud Detection**: False positive rate, detection accuracy
- **Settlement**: Payouts processed, total amount, success rate
- **API Response Times**: Auth, workers, payouts endpoints
- **Database**: Query times, connection pool utilization
- **Frontend**: Page load time, error rates in console

---

## 🎯 Quick Feature Implementation Guide

### Adding a new API endpoint

1. **Create handler in appropriate router**:
   ```python
   @router.post("/new-endpoint")
   async def new_endpoint(data: RequestModel):
       # Logic
       return ResponseModel
   ```

2. **Register router in main.py** (if new module):
   ```python
   from api.new_module import router as new_router
   app.include_router(new_router)
   ```

3. **Call from frontend**:
   ```javascript
   const response = await axios.post('/api/v1/new-endpoint', data);
   ```

### Adding a new background job

1. **Create job function in `cron/`**:
   ```python
   async def my_job():
       logging.info("Running my job...")
       # Logic here
   ```

2. **Register in main.py lifespan**:
   ```python
   scheduler.add_job(my_job, "interval", seconds=300, id="my_job")
   ```

### Adding a new ML feature

1. **Add to feature engineering** (`ml/fraud_features_engineering.py`)
2. **Add to training dataset**
3. **Retrain models** (`ml/train_fraud_models.py`)
4. **Update fraud_detector.py to use new feature**

---

## 💡 Best Practices Used in Codebase

✅ **Async/Await**: All I/O operations are non-blocking  
✅ **Pydantic Models**: Type-safe request/response validation  
✅ **Environment Config**: Secrets managed via .env  
✅ **Logging**: Structured logs with context  
✅ **Error Handling**: Graceful degradation when APIs fail  
✅ **Caching**: Redis for hot data (DCI scores)  
✅ **Background Jobs**: APScheduler for periodic tasks  
✅ **Documentation**: Code comments + API docs  
✅ **Testing**: Smoke tests + unit test patterns  
✅ **Security**: JWT validation, CORS, input validation  

