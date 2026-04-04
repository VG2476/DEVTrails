# 🛡️ GigKavach Codebase - Comprehensive Deep Dive

**Project Status:** ✅ Phase 2 Complete (Production Ready)  
**Date:** April 2026  
**Target Users:** 10M+ India gig workers (Zomato/Swiggy)  
**Core Problem Solved:** Income protection during disruption events

---

## 📍 Project Overview

**GigKavach** is a parametric income protection platform for gig workers. It automatically detects disruption events (heavy rain, traffic gridlock, heatwaves) using a real-time **Disruption Composite Index (DCI)**, calculates AI-powered payouts, and credits worker UPI accounts by end of day—**without requiring any claim filing**.

### Key Value Proposition
- **Zero Claims Process**: Automated detection → Automatic payout
- **Same-Day Settlement**: DCI triggered → Money in UPI by midnight
- **Parametric Model**: No need for adjuster approval or claim verification
- **WhatsApp-First**: 4-minute onboarding via WhatsApp, weekly premium as low as ₹69

---

## 🏗️ BACKEND ARCHITECTURE

### Framework & Entry Point
- **Framework**: FastAPI (async Python web framework)
- **Entry Point**: `backend/main.py`
- **Server Entry**: `backend/server.py` (ASGI compatibility wrapper)
- **Python Version**: 3.11-slim

#### Main Application Structure (main.py)
```python
# Provides:
✅ FastAPI app initialization with metadata
✅ CORS configuration for React frontend
✅ Router registration (8 router modules)
✅ APScheduler background job setup
✅ Lifespan hooks (startup/shutdown)
✅ Critical credential validation warnings
```

### API Endpoints (8 Router Modules)

| Module | Prefix | Purpose | Status |
|--------|--------|---------|--------|
| `auth.py` | `/auth` | Login, token refresh, user verification | ✅ Active |
| `workers.py` | `/workers` | Worker registration, profiles, list | ✅ Active |
| `policies.py` | `/policies` | Policy CRUD, plan upgrades, shift management | ✅ Active |
| `dci.py` | `/dci` | DCI scores, historical data, alerts | ✅ Active |
| `dci_alerts.py` | `/dci-alerts` | Alert notifications for triggered zones | ✅ Active |
| `dci_Dashboard.py` | `/dci-dashboard` | Admin DCI visualization | ✅ Active |
| `payouts.py` | `/payouts` | Payout status, live feed | ✅ Active |
| `fraud.py` | `/fraud` | Fraud detection API | ✅ Active |
| `health.py` | `/health` | Health check endpoint | ✅ Active |
| `whatsapp.py` | `/whatsapp` | WhatsApp onboarding, notifications | ✅ Active |

### Authentication System

**Type**: Supabase Auth (JWT-based)

**Flow**:
```
POST /auth/login 
  → Email + Password
  → Supabase Auth API
  → Returns: access_token, refresh_token, expires_in
  ↓
GET /auth/me (with Bearer token)
  → Validates token with Supabase
  → Returns: User ID, email, role
  ↓
POST /auth/refresh
  → Uses refresh_token
  → Returns: New access_token
```

**Protected Routes**: Use `Depends(verify_token)` decorator  
**Token Validation**: Makes HTTP request to Supabase auth endpoint

### Core Business Logic Services

#### 1. **DCI Engine** (`services/dci_engine.py`)
Calculates the Disruption Composite Index from 5 weighted components:

```
DCI = 0.30×weather + 0.20×aqi + 0.20×heat + 0.20×social + 0.10×platform

Severity Tiers:
  0-29   → "none"        (no disruption)
  30-49  → "low"         (minor disruption)
  50-64  → "moderate"    (moderate disruption)
  65-79  → "high"        (significant disruption) ⚠️ TRIGGERS PAYOUTS
  80-94  → "critical"    (severe disruption)
  ≥95    → "catastrophic" (NDMA override)
```

**Components**:
- **Weather** (30%): Rainfall intensity, flood signals from Tomorrow.io
- **AQI** (20%): Air quality index from AQICN/OpenAQ
- **Heat** (20%): Temperature stress (gradient 38-42°C)
- **Social** (20%): Bandh/unrest from NLP classification of RSS feeds
- **Platform** (10%): Delivery block signals from Zomato/Swiggy APIs

#### 2. **Fraud Detection Service** (`services/fraud_service.py`)
3-stage pipeline protecting against fraudulent claims:

**Stage 1: Rule-Based Hard Blocks**
- Device farming: Multiple workers on same device
- Rapid re-claim: Claiming within 6 hours
- Zone density surge: 5+ workers claiming same zone in 30 min
- Threshold gaming: 3+ claims near DCI 65-70 band

**Stage 2: Isolation Forest** (Unsupervised Anomaly Detection)
- Detects statistical anomalies in claim patterns
- Examines: GPS vs IP location mismatch, unusual timing, co-claim patterns
- Output: Anomaly score (0-1)

**Stage 3: XGBoost** (Supervised Classification)
- 31-feature ML model trained on labeled fraud data
- Features: Worker history, claim patterns, spatial-temporal context
- Output: Fraud probability (0-1)

**Ensemble Decision**:
```
If Stage 1 triggers → fraud_score = 0.9 (high confidence, BLOCK)
Else → fraud_score = 0.2×IF_score + 0.8×XGBoost_score
       ↓
       If fraud_score > 0.50 → BLOCK (0% payout)
       If fraud_score > 0.30 → FLAG_50 (50% hold, re-verify in 48h)
       Else → APPROVE (100% payout)
```

#### 3. **Payout Service** (`services/payout_service.py`)
Dynamic payout multiplier prediction:

```
Base Payout = baseline_earnings × (disruption_duration / 480 min)
     ↓
Multiplier = XGBoost_v3(dci_score, city, zone_density, shift, disruption_type, ...)
     ↓
Final Payout = Base Payout × Multiplier (clamped 1.0x - 5.0x)
```

**Example**:
- Baseline earnings: ₹850/day
- Disruption duration: 240 minutes
- Base payout: 850 × (240/480) = ₹425
- Multiplier (XGBoost): 1.5x
- **Final: ₹637.50**

#### 4. **Additional Services**
- **Weather Service**: Tomorrow.io API integration
- **AQI Service**: AQICN + OpenAQ API integration
- **Heat Service**: Temperature stress calculations
- **Social Service**: RSS feed + NLP for social disruption
- **Eligibility Service**: Policy validation, shift window checks
- **Payment Service**: Razorpay UPI payout integration
- **Onboarding Service**: WhatsApp-based OTPK registration
- **Baseline Service**: Worker earnings fingerprinting

---

## 📊 DATABASE SCHEMA (Supabase PostgreSQL)

### Core Tables

#### 1. **workers** (10+ columns)
```sql
CREATE TABLE workers (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  phone_number VARCHAR(20) UNIQUE,
  platform VARCHAR(50),         -- 'zomato' | 'swiggy'
  upi_id VARCHAR(100),
  pin_codes TEXT[] DEFAULT [],  -- Works in these zones
  shift VARCHAR(50),             -- 'morning' | 'night' | 'flexible'
  shift_start TIME,
  shift_end TIME,
  language VARCHAR(50),
  plan VARCHAR(50),              -- 'basic' (40%) | 'plus' | 'pro' (70%)
  coverage_pct INTEGER,          -- Coverage percentage
  gig_score NUMERIC(5,2),        -- Trust score (starts 100.0)
  coverage_active_from TIMESTAMP, -- 24h delay for new workers
  onboarded_at TIMESTAMP,
  is_active BOOLEAN,
  created_at TIMESTAMP
);
```

**Key Concept**: `gig_score` = Trust metric reflecting worker behavior  
**Moral Hazard**: `coverage_active_from` = 24h delay before payouts kick in

#### 2. **policies** (Weekly coverage record)
```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  worker_id UUID REFERENCES workers(id),
  plan VARCHAR(50),              -- Snapshot of tier for this week
  shift VARCHAR(50),             -- Snapshot of shift at policy creation
  pin_codes TEXT[],              -- Zones covered this week
  status VARCHAR(50),            -- 'active' | 'expired'
  week_start DATE,
  week_end DATE,                 -- Monday-Sunday cycle
  coverage_pct INTEGER,
  premium_paid NUMERIC(8,2),     -- ₹ premium collected for week
  is_active BOOLEAN,
  created_at TIMESTAMP
);
```

**Business Rule**: New policy created every Monday with updated tier (plan changes effective Mondays)

#### 3. **claims** (DCI triggered → payout)
```sql
CREATE TABLE claims (
  id UUID PRIMARY KEY,
  worker_id UUID REFERENCES workers(id),
  dci_score NUMERIC(5,2),        -- DCI at trigger time
  disruption_duration INTEGER,   -- Minutes (0-480)
  disruption_type VARCHAR(100),  -- 'Rain' | 'Heatwave' | 'Flood'
  baseline_earnings NUMERIC(10,2),
  city VARCHAR(100),
  pincode VARCHAR(20),
  zone_density VARCHAR(20),      -- 'High' | 'Mid' | 'Low'
  hour_of_day INTEGER,
  day_of_week INTEGER,
  shift VARCHAR(50),
  status VARCHAR(50),            -- 'pending' | 'processing' | 'approved'
  fraud_score NUMERIC(5,4),
  fraud_decision VARCHAR(50),    -- 'APPROVE' | 'FLAG_50' | 'BLOCK'
  is_fraud BOOLEAN,
  payout_amount NUMERIC(10,2),
  payout_multiplier NUMERIC(5,3),
  processed_at TIMESTAMP,
  created_at TIMESTAMP
);
```

#### 4. **payouts** (Payment record)
```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY,
  worker_id UUID REFERENCES workers(id),
  claim_id UUID,                 -- Links to claims table
  base_amount NUMERIC(10,2),
  surge_multiplier DECIMAL(5,2), -- From payout_service
  final_amount NUMERIC(10,2),    -- Actual ₹ sent
  fraud_score DECIMAL(5,2),
  status VARCHAR(50),            -- 'pending' | 'processing' | 'completed'
  triggered_at TIMESTAMP,
  created_at TIMESTAMP
);
```

#### 5. **activities** & **activity_log**
Track worker engagement, login times, orders completed, shifts worked

### Indexes
```sql
-- For fast lookups
idx_workers_is_active
idx_workers_pincode (GIN - array search)
idx_policies_worker_id
idx_claims_worker_id
idx_claims_status
idx_payouts_triggered_at (DESC for recency)
```

---

## 🤖 ML/FRAUD DETECTION MODELS

### Model Architecture: 3-Stage Pipeline

#### **Stage 1: Rule-Based Heuristics** (Deterministic)
- Hard blocks on obvious fraud patterns
- No false negatives on known attack vectors

**Rules**:
1. **Device Farming**: Same device_id from 2+ workers in 10 min
2. **Rapid Re-Claim**: Worker claiming twice within 6 hours
3. **Zone Density Surge**: 5+ workers in same pincode within 30 min
4. **Threshold Gaming**: 3+ claims in DCI 65-70 band

#### **Stage 2: Isolation Forest** (Unsupervised)
```python
# Location: backend/ml/fraud_detector.py
model_path = "models/fraud_detection_v2/stage2_isolation_forest.pkl"

# Contamination rate: 5% (assumes 5% fraud baseline)
# Uses 31 features from feature_engineering.py
# Logic: High anomaly score = unusual claim pattern
```

**Features Used**:
- GPS coordinates (lat, lon)
- IP-detected location
- Claims in zone within 2 minutes
- Claim timestamp standard deviation
- Platform earnings/orders before disruption
- Worker history (7-day claim count, DCI patterns)
- Device ID consistency
- Zone claim density

#### **Stage 3: XGBoost** (Supervised Classifier)
```python
# Location: backend/ml/xgboost_loader.py
model_path = "models/fraud_detection_v2/stage3_xgboost.pkl"

# Training data: synthetic + labeled real claims
# Features: Same 31 as above + temporal features
# Output: Probability of fraud (0-1)
```

**Training Process**: (`backend/ml/train_fraud_models.py`)
- Generates synthetic fraud datasets
- Trains on GPUs (10,000+ samples)
- Cross-validates with holdout test set
- Evaluates precision/recall tradeoffs

#### **Feature Engineering** (`backend/ml/fraud_features_engineering.py`)
```python
NUMERICAL_FEATURES = [
  # Spatial
  'gps_lat', 'gps_lon', 'ip_lat', 'ip_lon',
  'gps_ip_distance_km',
  'claims_in_zone_2min', 'zone_claim_density',
  
  # Temporal
  'hour_of_day', 'day_of_week', 'claim_timestamp_std_sec',
  'dci_score',
  
  # Worker History
  'claims_last_7days', 'last_claim_delta_hours',
  'gig_score', 'avg_dci_at_claim',
  'device_id_consistency', 'co_claim_count_10min',
  
  # Disruption Context
  'baseline_earnings', 'platform_orders_before',
  'disruption_outside_shift',
  
  # (31 total)
]
```

### Training & Inference

**Training Pipeline** (`backend/ml/train_enhanced_xgboost.py`):
1. Load synthetic fraud dataset
2. Engineer 31 features
3. Normalize with StandardScaler
4. Train XGBoost with:
   - max_depth=6, learning_rate=0.1, n_estimators=100
   - eval_metric='logloss'
5. Serialize models to `.pkl` files

**Inference** (`services/fraud_service.py`):
```python
detector = FraudDetector()
result = detector.detect_fraud(claim, worker_history)

# Result structure:
{
  "fraud_score": 0.45,           # Ensemble score: 0.2*IF + 0.8*XGB
  "decision": "FLAG_50",         # APPROVE | FLAG_50 | BLOCK
  "fraud_type": "Zone density surge",
  "stage1_result": "PASS",
  "stage2_score": 0.65,          # Isolation Forest
  "stage3_score": 0.42,          # XGBoost
  "confidence": 0.92
}
```

### Payout Multiplier Model (XGBoost v3)

**Purpose**: Predict dynamic multiplier (1.0x - 5.0x) based on:
- DCI score
- Disruption type & duration
- Worker location (city, zone_density)
- Time context (hour, day_of_week)
- Worker shift

**Training Data**: Labeled claims with actual payout outcomes  
**Location**: `backend/ml/xgboost_loader.py`

---

## 🌐 FRONTEND ARCHITECTURE

### Tech Stack
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite (fast bundling, <1s HMR)
- **Styling**: TailwindCSS 3.4 + PostCSS
- **Routing**: React Router v7
- **HTTP Client**: Axios
- **Charts**: Recharts
- **Maps**: Leaflet.js
- **Icons**: Lucide React
- **Testing**: Vitest + React Testing Library
- **Auth**: Supabase client

### Project Structure

```
frontend/
├── src/
│   ├── pages/               # Page components (route targets)
│   │   ├── Dashboard.jsx    # Admin panel with payouts, DCI, alerts
│   │   ├── Workers.jsx      # Worker list with filters
│   │   ├── Fraud.jsx        # Fraud detection dashboard
│   │   ├── Payouts.jsx      # Payout live feed
│   │   ├── Heatmap.jsx      # Geographic zone heatmap
│   │   ├── Analytics.jsx    # KPI trends
│   │   ├── Login.jsx        # Auth entry
│   │   └── Settings.jsx     # Configuration
│   ├── components/
│   │   ├── common/          # Reusable UI (Button, Input, Card)
│   │   ├── layout/          # Layout (Header, Sidebar, Layout wrapper)
│   │   ├── dci/             # DCI-specific (DCIChart, DCIStatus)
│   │   ├── fraud/           # Fraud detection UI
│   │   ├── payouts/         # Payout feed components
│   │   ├── policies/        # Policy management UI
│   │   ├── workers/         # Worker list, modal, detail view
│   │   └── ...
│   ├── context/
│   │   └── AuthContext.jsx  # Global auth state
│   ├── services/
│   │   ├── supabaseClient.js # Supabase auth instance
│   │   └── keepAlive.js      # Ping backend to prevent cold starts
│   ├── hooks/               # Custom React hooks
│   ├── utils/               # Helper functions
│   ├── styles/              # Global CSS
│   ├── api/                 # API client constants (not found, may be inline)
│   ├── App.jsx              # Root router component
│   └── main.jsx             # React entry point
│
├── index.html               # HTML entry
├── vite.config.ts           # Build configuration
├── tsconfig.json            # TypeScript config
├── tailwind.config.js       # TailwindCSS config
├── package.json             # Dependencies (React 19, Vite, Tailwind)
└── ...
```

### Key Pages

#### 1. **Dashboard** (Admin Overview)
- Recent payouts (3 latest)
- DCI chart (historical trends)
- Worker count & active zones
- Tax/surge statistics
- Live payout processing feed

#### 2. **Workers** (Management)
- List of all workers
- Filters (active/inactive, plan tier)
- Plan view: Worker name, platform, earnings, status
- Click to open detail modal with:
  - Claims history
  - Payout history
  - Gig score
  - Policy details

#### 3. **Fraud** (Detection Dashboard)
- Real-time fraud alerts
- Suspicious claims flagged by ML
- Show fraud score, reason, actions taken
- Flag/approve decision override UI

#### 4. **Payouts** (Live Feed)
- Status: triggered → calculating → fraud_check → payout_sent
- Shows: Worker name, amount, DCI, fraud score, timestamp
- Filter by status (processing, completed, failed)

#### 5. **Heatmap** (Geographic Zones)
- Leaflet.js map with zones
- Color-coded by DCI severity
- Shows DCI score overlay
- Pincode boundaries

#### 6. **Analytics** (Trends & Insights)
- Total payouts by day
- Average payout amounts
- Fraud detection rate
- Worker activation trends

### Authentication Flow

```
User Input (Email + Password)
    ↓
AuthContext.login()
    ↓
supabase.auth.signInWithPassword()
    ↓
Supabase JWT returned
    ↓
localStorage stores token
    ↓
axios instance includes in Authorization header
    ↓
Protected routes check isAuthenticated
    ↓
If expired: refresh using refresh_token
```

### API Integration Pattern

```javascript
// Services layer (e.g., payoutAPI)
const payoutAPI = {
  async getAll(params) {
    const response = await axios.get('/api/payouts', { params });
    return response.data;  // { payouts: [...], count: N }
  },
  async get(id) { ... },
  async create(data) { ... }
};

// In components:
const Dashboard = () => {
  const [payouts, setPayouts] = useState([]);
  
  useEffect(() => {
    payoutAPI.getAll().then(res => {
      setPayouts(res.payouts);
    });
  }, []);
};
```

### State Management

- **Auth**: React Context (AuthContext.jsx)
- **Page State**: Local useState
- **API Caching**: Simple refetch patterns (could upgrade to React Query)
- **Supabase Real-time**: Not currently used (could add subscriptions for live updates)

---

## ⚙️ SERVICES & UTILITIES

### Backend Services (backend/services/)

| Service | Purpose | Key Functions |
|---------|---------|---|
| `aqi_service.py` | Air quality aggregation | fetch_aqi_score(pincode) |
| `baseline_service.py` | Earnings fingerprinting | calculate_baseline_earnings(worker_id) |
| `dci_engine.py` | Core DCI calculation | calculate_dci(weather, aqi, heat, ...) |
| `eligibility_service.py` | Policy validation | is_eligible_for_payout(claims) |
| `fraud_service.py` | Fraud detection | check_fraud(claim, worker_history) |
| `heat_service.py` | Heat stress calc | calculate_heat_score(temp, humidity) |
| `onboarding_handlers.py` | WhatsApp onboarding flow | handle_whatsapp_msg() |
| `payment_service.py` | Razorpay integration | create_payout(amount, upi_id) |
| `payout_service.py` | Dynamic multiplier calc | calculate_payout(...) → multiplier |
| `platform_service.py` | Zomato/Swiggy integration | get_delivery_blocks() |
| `social_service.py` | Social disruption (NLP) | detect_bandh_signals() |
| `weather_service.py` | Tomorrow.io API | get_weather_forecast(pincode) |
| `whatsapp_service.py` | Twilio messaging | send_whatsapp_alert(worker_id) |

### Backend Utilities (backend/utils/)

| Utility | Purpose |
|---------|---------|
| `supabase_client.py` | Lazy-loaded Supabase client |
| `redis_client.py` | Async Redis wrapper (DCI cache) |
| `db.py` | Database connection helper |
| `cache.py` | TTL-based cache decorator |
| `validators.py` | Pydantic validators |
| `datetime_utils.py` | Shift time validation |
| `geocoding.py` | Mappl geocoding |
| `pincode_mapper.py` | Pincode → city/zone mapping |
| `logger.py` | Structured logging setup |

---

## 🔄 BACKGROUND JOBS & CRON TASKS

### APScheduler Jobs (backend/cron/)

#### 1. **DCI Poller** (`cron/dci_poller.py`)
- **Frequency**: Every 5 minutes (configurable via `DCI_POLL_INTERVAL_SECONDS`)
- **Logic**:
  1. Fetch active zones from database
  2. Call 5 component APIs (weather, AQI, heat, social, platform)
  3. Calculate DCI for each zone
  4. Cache in Redis (TTL: 30 min)
  5. Log to Supabase `dci_logs` table
  6. Trigger payouts for DCI ≥ 65

- **Impact**: Real-time DCI updates across all zones

#### 2. **Settlement Service** (`cron/settlement_service.py`)
- **Frequency**: Daily at 11:55 PM (before midnight)
- **Logic**:
  1. Find all claims with status "pending"
  2. Run fraud detection (3-stage pipeline)
  3. Calculate payout multipliers (XGBoost)
  4. Initiate Razorpay UPI transfers
  5. Mark payouts as "completed"
  6. Send WhatsApp confirmation to workers

- **Impact**: All payouts settled and in worker UPI by midnight

#### 3. **Claims Trigger** (`cron/claims_trigger.py`)
- **Frequency**: Every 5 minutes (aligned with DCI poller)
- **Logic**:
  1. Identify zones where DCI ≥ 65
  2. Find active workers in those zones during their shift
  3. Check eligibility (24h mora hazard delay, policy active, etc.)
  4. Create claim records in database
  5. Notify workers via WhatsApp
  6. Queue for fraud detection

- **Impact**: Automatic claim generation (zero manual effort)

#### 4. **Keep-Alive Ping** (`cron/keep_alive.py`)
- **Frequency**: Every 10 minutes
- **Logic**: HTTP GET to backend /health
- **Purpose**: Prevent Render free tier cold starts
- **Frontend**: `frontend/services/keepAlive.js` (similar)

---

## 🐳 DEVOPS & INFRASTRUCTURE

### Docker Setup

```dockerfile
# Stage 1: Build
FROM python:3.11-slim as builder
WORKDIR /app
RUN apt-get install build-essential
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# Stage 2: Runtime (minimal)
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY backend/ .
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Strategy**: Multi-stage build to minimize image size

### Deployment Targets

#### Backend (Render.com)
- **File**: `render.yaml`
- **Service Type**: Web service
- **Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Build**: Automatic on git push
- **Env Vars**: Loaded from Render dashboard (.env)
- **Database**: Supabase (external)
- **Cache**: Redis Cloud (external)

#### Frontend (Vercel)
- **File**: `vercel.json`
- **Framework**: React + Vite
- **Build Command**: `npm run build`
- **Output Dir**: `dist/`
- **Env Vars**: Loaded from Vercel dashboard
- **CDN**: Automatic edge caching

### Environment Configuration

**File**: `backend/.env` (git-ignored, from `.env.example`)

```env
# App
APP_ENV=production
APP_SECRET_KEY=<secret>

# Database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=<secret>

# Cache
REDIS_URL=redis://localhost:6379/0

# APIs
TOMORROW_IO_API_KEY=<key>
AQICN_API_TOKEN=<key>
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=<secret>
RAZORPAY_KEY_ID=razorpay_id
RAZORPAY_KEY_SECRET=<secret>

# DCI Engine
DCI_POLL_INTERVAL_SECONDS=300
DCI_TRIGGER_THRESHOLD=65
DCI_CATASTROPHIC_THRESHOLD=85
```

### Health Checks

**Backend**:
```
GET /health
Response: 200 OK { "status": "healthy", "timestamp": "..." }
```

**Frontend**: 
- Automatic Vercel health checks
- Keep-alive service pings backend every 10 min

---

## 📈 CURRENT DEVELOPMENT STATUS

### Phase 2 Completion (April 2, 2026)
✅ **ALL DELIVERABLES COMPLETE**

#### P2.1: Code Cleanup
- ✅ Removed 6 duplicate empty TSX files
- ✅ Standardized on JSX (single source of truth)
- ✅ All imports resolved cleanly

#### P2.2: Documentation
- ✅ API Reference (350+ lines)
- ✅ Deployment Guides (1000+ lines)
- ✅ Configuration Summary
- ✅ Deployment Checklist

#### P2.3: Demo Hardening
- ✅ Deterministic demo dataset (`data/fraud_training_v3_labeled.csv`)
- ✅ Smoke test script (`backend/demo_claims_smoke_test.py`)
- ✅ 1-click repeatable pitch flow (<5 seconds)

### Build Verification ✅

| Component | Status | Details |
|-----------|--------|---------|
| Backend Python | ✅ | No syntax errors, all imports valid |
| Frontend Build | ✅ | 769 KB JS + 71 KB CSS, zero errors |
| Dependencies | ✅ | 30+ backend packages, 336+ frontend packages |
| Database | ✅ | Schema created, indices optimized |
| Docker Image | ✅ | Builds successfully, runs on Render |
| Deployment Config | ✅ | render.yaml + vercel.json ready |

### Production Readiness

**Deployment Targets**:
- 🎯 **Backend**: Render.com (Web service)
- 🎯 **Frontend**: Vercel (Static + CDN)
- 🎯 **Database**: Supabase (Managed PostgreSQL)
- 🎯 **Cache**: Redis Cloud (or self-hosted)

**Secrets Management**: Environment variables via platform dashboards

**CI/CD**: GitHub Actions workflows configured (optional)

---

## 🔐 KEY IMPLEMENTATION PATTERNS

### 1. **Async/Await Throughout**
- FastAPI uses async handlers
- Services use `asyncio.run_in_executor()` for blocking operations
- Frontend uses Promises and async/await

### 2. **Error Handling & Validation**
- **Backend**: Pydantic models validate all inputs
- **HTTPException** for API errors with proper status codes
- **Graceful Degradation**: Warnings logged if APIs fail (doesn't crash)

### 3. **Caching Strategy**
- **DCI Scores**: Redis (30-min TTL)
- **Worker Profiles**: Supabase table queries (no caching)
- **ML Models**: Loaded once at startup (pickle files)

### 4. **Fraud Detection Confidence**
- Stage 1 rules → High confidence (0.9)
- ML blend → Moderate confidence
- Used for decision (APPROVE/FLAG_50/BLOCK)

### 5. **Auditability**
- All fraud decisions logged with stage-wise scores
- Payout calculations tracked in database
- Worker actions logged in `activity_log` table

### 6. **Rate Limiting & Throttling**
- DCI poller: 5-min intervals (prevents API quota burn)
- Settlement: Once per day (11:55 PM)
- API endpoints: No explicit rate limiting (add if needed)

---

## 🛡️ EDGE CASES & SAFEGUARDS

### Handled Edge Cases

| Edge Case | Handling |
|-----------|----------|
| New worker starts mid-week | 24h coverage activation delay (moral hazard) |
| Worker changes plan (tier) mid-week | Current week: old tier; Next Monday: new tier |
| Worker changes shift mid-shift | Retroactive eligibility adjustment |
| DCI < 65 but disruption continues | Claim remains "pending" until processed at 11:55 PM |
| Claim fraud score borderline | FLAG_50: 50% payout + 48h re-verify |
| API (Weather/AQI) timeout | Fallback scoring, log warning, continue |
| Supabase down during settlement | Retry queue, exponential backoff |
| Duplicate device claims | Device farming rule blocks immediately |

### Security Considerations

✅ JWT validation on all protected routes  
✅ CORS configured for frontend origin only  
✅ `.env` secrets not in git (`.gitignore`)  
✅ Pydantic model validation prevents injection  
✅ Supabase Row-Level Security (RLS) policies (if configured)  
⚠️ Consider rate limiting on auth endpoints  
⚠️ Consider IP allowlisting for admin endpoints  

---

## 📊 DATA FLOW DIAGRAM

```
┌─────────────┐
│   Worker    │
│ (WhatsApp)  │
└──────┬──────┘
       │
       ▼
   ┌───────────────────────────────────┐
   │  Backend: Main.py (FastAPI)        │
   │  ┌─────────────────────────────┐   │
   │  │ DCI Poller (Every 5 min)    │   │─────────► Tomorrow.io (Weather)
   │  │ - Fetch zones               │   │─────────► AQICN (AQI)
   │  │ - Call 5 component APIs     │   │─────────► RSS Parser (Social)
   │  │ - Calculate DCI             │   │─────────► Zomato/Swiggy (Platform)
   │  │ - Cache to Redis            │   │
   │  │ - Trigger claims (DCI≥65)   │   │
   │  └─────────────────────────────┘   │
   │  ┌─────────────────────────────┐   │
   │  │ Fraud Detection (Real-time) │   │──────────► Rule-based blocks
   │  │ - Stage 1: Rules            │   │──────────► Stage 2: IF
   │  │ - Stage 2: Isolation Forest │   │──────────► Stage 3: XGBoost
   │  │ - Stage 3: XGBoost          │   │
   │  └─────────────────────────────┘   │
   │  ┌─────────────────────────────┐   │
   │  │ Settlement (Daily 11:55 PM) │   │──────────► Razorpay (Payouts)
   │  │ - Fraud check all claims    │   │──────────► Twilio (WhatsApp)
   │  │ - Calculate multipliers     │   │
   │  │ - Send payouts              │   │
   │  └─────────────────────────────┘   │
   └──────┬──────────────────────────────┘
          │
          ▼
   ┌─────────────────────────────────────┐
   │ Supabase (PostgreSQL Database)      │
   │ - workers, policies, claims, payouts│
   │ - activity_log, dci_logs            │
   └──────┬──────────────────────────────┘
          │
          ▼
   ┌─────────────────────────────────────┐
   │        Frontend (React + Vite)      │
   │ - Dashboard (Admin)                 │
   │ - Workers, Fraud, Payouts pages     │
   │ - Heatmap, Analytics               │
   └─────────────────────────────────────┘
```

---

## 🧪 TESTING & QUALITY ASSURANCE

### Available Test Files

```
backend/
├── demo_claims_pipeline.py     # Smoke test: claims end-to-end
├── demo_claims_smoke_test.py   # Quick 5-sec pitch demo
├── demo_dataset_seed.py        # Load deterministic data

frontend/
└── tests/                       # Vitest + React Testing Library
    └── (not extensively populated yet)
```

### Running Tests Locally

```bash
# Backend: Run smoke test
python backend/demo_claims_smoke_test.py

# Backend: Seed demo data
python backend/demo_dataset_seed.py

# Frontend: Run tests
npm run test

# Frontend: Watch mode
npm run test:watch

# Frontend: Coverage report
npm run test:coverage
```

---

## 🚀 QUICK START FOR DEVELOPERS

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (or Supabase account)
- Redis (local or cloud)

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Create .env from .env.example
cp .env.example .env
# Edit .env with your keys

# Run locally
uvicorn main:app --reload --port 8000
# API docs at http://localhost:8000/docs
```

### Frontend Setup
```bash
cd frontend
npm install

# Create .env.local (if needed)
VITE_API_BASE_URL=http://localhost:8000

# Run dev server
npm run dev
# Open http://localhost:5173
```

### Database Setup
```bash
# Create tables in Supabase SQL Editor
# Run: backend/database/schema.sql

# Optional: Seed demo data
python backend/demo_dataset_seed.py
```

---

## 📝 KEY FILES TO UNDERSTAND FIRST

**For Backend Architecture**:
1. `backend/main.py` — Entry point & router registration
2. `backend/config/settings.py` — Configuration & env vars
3. `backend/services/dci_engine.py` — Core DCI logic
4. `backend/services/fraud_service.py` — Fraud detection pipeline
5. `backend/database/schema.sql` — Database structure

**For ML/Fraud**:
1. `backend/ml/fraud_detector.py` — 3-stage pipeline
2. `backend/ml/train_fraud_models.py` — Model training
3. `backend/services/payout_service.py` — Payout multiplier

**For Frontend**:
1. `frontend/src/App.jsx` — Router setup
2. `frontend/src/pages/Dashboard.jsx` — Main admin page
3. `frontend/src/context/AuthContext.jsx` — Auth state
4. `frontend/src/services/supabaseClient.js` — DB connection

**For DevOps**:
1. `render.yaml` — Backend deployment
2. `vercel.json` — Frontend deployment
3. `Dockerfile` — Docker image
4. `.env.example` — Environment template

---

## 🎯 SUMMARY TABLE

| Aspect | Details |
|--------|---------|
| **Framework** | FastAPI (Python) + React (JavaScript) |
| **Database** | Supabase PostgreSQL |
| **Cache** | Redis |
| **ML Models** | XGBoost + Isolation Forest |
| **Key Feature** | Zero-touch parametric income insurance |
| **Deployment** | Render (backend) + Vercel (frontend) |
| **Integrations** | Twilio, Razorpay, Tomorrow.io, AQICN |
| **Development Status** | ✅ Phase 2 Complete, Production Ready |
| **Code Quality** | Well-structured, fully documented |
| **Scalability** | Horizontal scaling ready (stateless FastAPI) |

