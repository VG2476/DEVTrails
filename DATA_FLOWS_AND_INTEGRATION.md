# 🔄 GigKavach - Data Flows & Integration Patterns

**Comprehensive guide to how data moves through the system and how components integrate**

---

## 🌊 End-to-End Data Flow: From Disruption to Payout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    STEP 1: DISRUPTION DETECTION (Every 5 min)           │
└─────────────────────────────────────────────────────────────────────────┘

DCI Poller (cron/dci_poller.py):
│
├─→ Fetch active zones & worker locations from Supabase
│
├─→ Collect component data (parallel API calls):
│   ├─→ Tomorrow.io:  Get rainfall, temperature (pincode-based)
│   ├─→ AQICN:        Get AQI score
│   ├─→ OpenAQ:       Backup AQI source
│   ├─→ RSS Parser:   Fetch social media feeds for disruption signals
│   └─→ Zomato/Swiggy: Get delivery block status
│
├─→ Calculate DCI using weighted formula:
│   DCI = 0.30×weather + 0.20×aqi + 0.20×heat + 0.20×social + 0.10×platform
│
├─→ Store in Redis (key: "dci:score:{pincode}", TTL: 30 min)
│
└─→ Log to Supabase: INSERT INTO dci_logs (pincode, dci_score, components, ...)


┌─────────────────────────────────────────────────────────────────────────┐
│               STEP 2: CLAIMS CREATION (Every 5 min, DCI ≥ 65)           │
└─────────────────────────────────────────────────────────────────────────┘

Claims Trigger (cron/claims_trigger.py):
│
├─→ Query Redis for zones with DCI ≥ 65
│
├─→ For each zone:
│   ├─→ Find workers in zone (check pin_codes array in workers table)
│   ├─→ Verify worker eligibility:
│   │   ├─ Policy is active (status='active')
│   │   ├─ Within shift window (now between shift_start and shift_end)
│   │   ├─ 24h coverage activation delay passed
│   │   └─ Plan is active (not lapsed)
│   │
│   ├─→ Extract baseline earnings (from platform_earnings_before_disruption)
│   ├─→ Get zone characteristics (city, zone_density, hour_of_day, day_of_week)
│   │
│   ├─→ CREATE CLAIM in Supabase:
│   │   INSERT INTO claims (
│   │       worker_id, dci_score, disruption_duration,
│   │       baseline_earnings, status='pending', created_at
│   │   )
│   │
│   └─→ Send WhatsApp alert via Twilio:
│       "⚠️ Disruption detected in your zone. Your insurance is active."
│       "We will process your payout by midnight."


┌─────────────────────────────────────────────────────────────────────────┐
│                 STEP 3: FRAUD DETECTION (Real-time)                     │
└─────────────────────────────────────────────────────────────────────────┘

Fraud Service (services/fraud_service.py):
│
├─→ STAGE 1: Rule-Based Hard Blocks
│   ├─ Device farming check: SELECT count(*) WHERE device_id = ? AND created_at > now()-10min
│   ├─ Rapid re-claim: SELECT max(created_at) WHERE worker_id = ?
│   ├─ Zone density: SELECT count(*) WHERE pincode = ? AND created_at > now()-30min
│   └─ Threshold gaming: Check for clustering near DCI 65-70
│
├─→ STAGE 2: Isolation Forest (Unsupervised Anomaly)
│   ├─ Load model: models/fraud_detection_v2/stage2_isolation_forest.pkl
│   ├─ Build 31-feature vector (GPS, IP, history, timing)
│   ├─ Normalize with scaler: models/fraud_detection_v2/feature_scaler.pkl
│   └─ Output: anomaly_score (0-1, higher = more anomalous)
│
├─→ STAGE 3: XGBoost (Supervised Classifier)
│   ├─ Load model: models/fraud_detection_v2/stage3_xgboost.pkl
│   ├─ Use same 31 features
│   └─ Output: fraud_probability (0-1)
│
├─→ ENSEMBLE BLEND:
│   if stage1_triggered:
│       fraud_score = 0.90  (high confidence)
│   else:
│       fraud_score = 0.2×isolation_forest + 0.8×xgboost
│
└─→ UPDATE CLAIM:
    UPDATE claims SET fraud_score = ?, fraud_decision = ?, is_fraud = ?

    Decision mapping:
    fraud_score > 0.50  → "BLOCK"     (is_fraud=TRUE)
    fraud_score > 0.30  → "FLAG_50"   (is_fraud=MAYBE)
    fraud_score ≤ 0.30  → "APPROVE"   (is_fraud=FALSE)


┌─────────────────────────────────────────────────────────────────────────┐
│                STEP 4: SETTLEMENT & PAYOUT (Daily 11:55 PM)             │
└─────────────────────────────────────────────────────────────────────────┘

Settlement Service (cron/settlement_service.py):
│
├─→ Fetch all claims with status='pending':
│   SELECT * FROM claims WHERE status='pending' AND created_at < now()
│
├─→ For each pending claim:
│   │
│   ├─→ A. Calculate disruption duration
│   │   └─ disruption_end = claim.created_at + cron_interval * N
│   │
│   ├─→ B. Calculate base payout
│   │   base = baseline_earnings × (duration_minutes / 480)
│   │
│   ├─→ C. Predict payout multiplier (XGBoost v3)
│   │   Load: models/fraud_detection_v2/xgboost_payout.pkl
│   │   Input: [dci_score, city, zone_density, shift, disruption_type, ...]
│   │   Output: multiplier ∈ [1.0, 5.0]
│   │
│   ├─→ D. Calculate final payout
│   │   final_payout = base × multiplier
│   │
│   ├─→ E. CREATE PAYOUT RECORD:
│   │   INSERT INTO payouts (
│   │       worker_id, claim_id, base_amount, surge_multiplier,
│   │       final_amount, fraud_score, status='pending'
│   │   )
│   │
│   ├─→ F. Call Razorpay UPI API:
│   │   GET worker.upi_id from workers table
│   │   POST https://api.razorpay.com/v1/transfers
│   │   (UPI, amount=final_amount, notes=claim_id)
│   │
│   ├─→ G. Handle Razorpay response:
│   │   SUCCESS → UPDATE payouts SET status='completed'
│   │   FAILURE → UPDATE payouts SET status='failed', retry_count++
│   │
│   ├─→ H. Send WhatsApp confirmation:
│   │   "✅ Your payout of ₹{final_amount} has been sent to {upi_id}"
│   │   "Claim ID: {claim_id}"
│   │   "If not received in 2 hours, contact support."
│   │
│   └─→ I. UPDATE claim status:
│       UPDATE claims SET status='processed', processed_at=now()
│
└─→ Log settlement summary metrics

```

---

## 📡 Frontend-Backend Integration Points

### 1. Authentication Flow

```javascript
// FRONTEND (React)
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    // Call backend
    const response = await axios.post('/auth/login', {
      email,
      password
    });

    // Response:
    // {
    //   "access_token": "eyJ0eX...",
    //   "refresh_token": "refresh_123...",
    //   "expires_in": 3600,
    //   "user": { "id": "...", "email": "..." }
    // }

    // Store tokens
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('refresh_token', response.data.refresh_token);

    // Configure axios default header
    axios.defaults.headers.common['Authorization'] = 
      `Bearer ${response.data.access_token}`;

    // Redirect
    navigate('/dashboard');
  };
};
```

```python
# BACKEND (FastAPI)
@router.post("/login", response_model=AuthResponse)
async def login(credentials: LoginRequest):
    # Call Supabase Auth API
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": settings.SUPABASE_ANON_KEY},
            json={"email": credentials.email, "password": credentials.password}
        )

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    data = response.json()

    # Return tokens and user info
    return AuthResponse(
        access_token=data['access_token'],
        refresh_token=data['refresh_token'],
        expires_in=data['expires_in'],
        user=data['user']
    )
```

### 2. Dashboard Data Fetching

```javascript
// FRONTEND (Dashboard.jsx)
export const Dashboard = () => {
  const [recentPayouts, setRecentPayouts] = useState([]);
  const [dciData, setDciData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch recent payouts
        const payoutRes = await axios.get('/api/payouts', {
          params: { limit: 3 }
        });
        setRecentPayouts(payoutRes.data.payouts);

        // Fetch DCI alerts
        const dciRes = await axios.get('/api/dci/latest-alerts');
        setDciData(dciRes.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      {recentPayouts.map(payout => (
        <PayoutCard key={payout.id} payout={payout} />
      ))}
    </div>
  );
};
```

```python
# BACKEND (api/payouts.py)
@router.get("/payouts", response_model=ProcessingPayoutListResponse)
async def list_payouts(limit: int = 20):
    sb = get_supabase()

    # Query payouts table
    result = (
        sb.table("payouts")
        .select("id, worker_id, final_amount, fraud_score, status, triggered_at")
        .order("triggered_at", desc=True)
        .limit(limit)
        .execute()
    )

    rows = result.data or []

    # Fetch worker names (missing from payouts table)
    worker_ids = [row['worker_id'] for row in rows if row['worker_id']]
    workers = (
        sb.table("workers")
        .select("id, name")
        .in_("id", worker_ids)
        .execute()
    )
    worker_map = {w['id']: w['name'] for w in workers.data or []}

    # Format response
    payouts = [
        ProcessingPayout(
            id=row['id'],
            worker_name=worker_map.get(row['worker_id'], 'Unknown'),
            amount=float(row['final_amount']),
            fraud_score=float(row['fraud_score']) if row['fraud_score'] else None,
            status=row['status'],
            timestamp=row['triggered_at']
        )
        for row in rows
    ]

    return ProcessingPayoutListResponse(payouts=payouts, count=len(payouts))
```

### 3. Fraud Detection API Call

```javascript
// FRONTEND (Fraud.jsx)
const FraudDetectionPage = () => {
  const [fraudAlerts, setFraudAlerts] = useState([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await axios.post('/api/check-fraud', {
          claim: {
            claim_id: '...',
            worker_id: '...',
            dci_score: 75,
            gps_coordinates: [12.9352, 77.6245],
            gps_verified_pct: 0.95,
            ip_location: [12.935, 77.625],
            claims_in_zone_2min: 3,
            claim_timestamp_std_sec: 120
          },
          worker_history: {
            claims_last_7_days: 5,
            dci_scores_at_claim: [65, 70, 60, 75],
            zone_claim_density: 2.5
          }
        });

        // Response:
        // {
        //   "is_fraud": false,
        //   "fraud_score": 0.28,
        //   "decision": "APPROVE",
        //   "fraud_type": null,
        //   "payout_action": "100%",
        //   "explanation": "Claim appears legitimate",
        //   "audit_log": {...}
        // }

        setFraudAlerts([response.data]);
      } catch (error) {
        console.error('Fraud check failed:', error);
      }
    };

    fetchAlerts();
  }, []);

  return (
    <div>
      {fraudAlerts.map(alert => (
        <FraudAlert key={alert.claim_id} alert={alert} />
      ))}
    </div>
  );
};
```

```python
# BACKEND (api/fraud.py)
@router.post("/check-fraud", response_model=FraudCheckResponse)
async def check_fraud_endpoint(request: FraudCheckRequest):
    from services.fraud_service import check_fraud

    try:
        # Convert Pydantic models to dicts
        claim_dict = request.claim.dict()
        worker_history_dict = (
            request.worker_history.dict() if request.worker_history else None
        )

        # Call fraud service
        result = check_fraud(
            claim=claim_dict,
            worker_history=worker_history_dict,
            user_context=request.user_context
        )

        # Format response
        return FraudCheckResponse(
            is_fraud=result['is_fraud'],
            fraud_score=result['fraud_score'],
            decision=result['decision'],
            fraud_type=result['fraud_type'],
            payout_action=result['payout_action'],
            explanation=result['explanation'],
            confidence=result['audit_log']['confidence'],
            audit_log=result['audit_log']
        )

    except Exception as e:
        logger.error(f"Fraud check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Fraud detection service unavailable"
        )
```

---

## 🔗 Supabase Integration Pattern

### Database Connection

```python
# backend/utils/supabase_client.py
from supabase import create_client
from config.settings import settings

_supabase_client = None

def get_supabase():
    """Lazy-loaded Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY
        )
    return _supabase_client
```

### Query Pattern

```python
# Example: Fetch worker by ID
sb = get_supabase()
result = (
    sb.table("workers")
    .select("*")
    .eq("id", worker_id)
    .limit(1)
    .execute()
)

if result.data:
    worker = result.data[0]
else:
    raise HTTPException(status_code=404, detail="Worker not found")
```

### Mutation Pattern

```python
# Example: Update worker plan
sb = get_supabase()
result = (
    sb.table("workers")
    .update({"plan": "pro"})
    .eq("id", worker_id)
    .execute()
)

if not result.data:
    raise HTTPException(status_code=400, detail="Update failed")
```

### Real-Time Subscriptions (Future Enhancement)

```javascript
// Frontend can subscribe to real-time changes
// Not currently used, but architecture supports it
const listenToPayouts = () => {
  supabase
    .from('payouts')
    .on('*', payload => {
      console.log('New payout:', payload.new);
      setRecentPayouts(prev => [payload.new, ...prev]);
    })
    .subscribe();
};
```

---

## ☁️ External API Integration Patterns

### Weather API (Tomorrow.io)

```python
# services/weather_service.py
import httpx

async def get_weather_forecast(pincode: str) -> dict:
    """Fetch weather data for a pincode."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.tomorrow.io/v4/weather/forecast",
            params={
                "location": pincode,
                "timesteps": "5m",
                "units": "metric",
                "apikey": settings.TOMORROW_IO_API_KEY
            }
        )

    if response.status_code != 200:
        logger.error(f"Weather API failed: {response.text}")
        return {"rainfall": 0, "temperature": 25}  # Fallback

    data = response.json()
    return {
        "rainfall": data['timelines']['minutely'][0]['values']['precipitationIntensity'],
        "temperature": data['timelines']['minutely'][0]['values']['temperature']
    }
```

### Payment API (Razorpay)

```python
# services/payment_service.py
import razorpay

client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)

def initiate_payout(worker_upi_id: str, amount: float, claim_id: str) -> dict:
    """Initiate UPI payout via Razorpay."""
    try:
        response = client.transfer.create(
            account_id=worker_upi_id,
            amount=int(amount * 100),  # Convert to paise
            currency="INR",
            description=f"Claim #{claim_id}",
            notes={
                "claim_id": claim_id,
                "product": "GigKavach"
            }
        )
        return {"success": True, "transfer_id": response['id']}
    except Exception as e:
        logger.error(f"Payout failed: {e}")
        return {"success": False, "error": str(e)}
```

### Messaging API (Twilio WhatsApp)

```python
# services/whatsapp_service.py
from twilio.rest import Client

twilio_client = Client(
    settings.TWILIO_ACCOUNT_SID,
    settings.TWILIO_AUTH_TOKEN
)

def send_whatsapp_alert(worker_phone: str, message: str):
    """Send WhatsApp message to worker."""
    try:
        message = twilio_client.messages.create(
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            body=message,
            to=f"whatsapp:{worker_phone}"
        )
        logger.info(f"WhatsApp sent to {worker_phone}: {message.sid}")
        return True
    except Exception as e:
        logger.error(f"WhatsApp failed: {e}")
        return False
```

---

## 🧠 ML Model Integration Pattern

### Loading Models at Startup

```python
# backend/main.py (lifespan hook)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP
    logger.info("Loading ML models...")

    # Models are loaded on-demand in services/fraud_service.py
    # They use lazy loading to avoid startup delays
    detector = FraudDetector()  # Loads .pkl files
    logger.info(f"✅ Models loaded: {detector.model_available}")

    yield

    # SHUTDOWN
    logger.info("Cleaning up...")
```

### Inference in Service

```python
# services/fraud_service.py
class FraudDetectionService:
    def __init__(self):
        self.detector = get_detector()  # Lazy-loaded once

    def check_fraud(self, claim, worker_history=None):
        # Engineer 31 features
        features = self.detector.feature_engineer.engineer_features(claim)

        # Run 3-stage pipeline
        result = self.detector.detect_fraud(claim, worker_history)

        # Stage 1: Rules
        if result['stage1_triggered']:
            fraud_score = 0.90
        # Stage 2 & 3: Blend
        else:
            fraud_score = (
                0.2 * result['stage2_score'] +  # Isolation Forest
                0.8 * result['stage3_score']    # XGBoost
            )

        return {
            'is_fraud': fraud_score > 0.30,
            'fraud_score': fraud_score,
            'decision': self._score_to_decision(fraud_score),
            ...
        }

    @staticmethod
    def _score_to_decision(score: float) -> str:
        if score > 0.50:
            return "BLOCK"
        elif score > 0.30:
            return "FLAG_50"
        else:
            return "APPROVE"
```

---

## 🔄 Cache Management (Redis)

### DCI Score Caching

```python
# DCI Poller caches results
@asynccontextmanager
async def cache_dci(pincode: str, dci_data: dict):
    """Store DCI in Redis with 30-min TTL."""
    rc = await get_redis()
    cache_key = f"dci:score:{pincode}"

    await rc.setex(
        cache_key,
        settings.DCI_CACHE_TTL_SECONDS,  # 1800s = 30 min
        json.dumps(dci_data)
    )

# Claims Trigger retrieves from cache
async def get_dci_score(pincode: str) -> Optional[dict]:
    """Retrieve cached DCI score."""
    rc = await get_redis()
    raw = await rc.get(f"dci:score:{pincode}")
    return json.loads(raw) if raw else None
```

### Cache Invalidation

```python
# When DCI is updated, cache is automatically refreshed (TTL)
# Or manually invalidated:
await rc.delete(f"dci:score:{pincode}")
```

---

## 🧪 Testing Integration Points

### Mock External APIs

```python
# tests/test_fraud_api.py
from unittest.mock import patch

@patch('services.fraud_service.check_fraud')
async def test_fraud_api(mock_check_fraud):
    # Mock fraud detection
    mock_check_fraud.return_value = {
        'is_fraud': False,
        'fraud_score': 0.15,
        'decision': 'APPROVE',
        ...
    }

    # Test API
    client = TestClient(app)
    response = client.post('/check-fraud', json={...})

    assert response.status_code == 200
    assert response.json()['decision'] == 'APPROVE'
```

### Smoke Test

```python
# backend/demo_claims_smoke_test.py
def test_end_to_end():
    """Quick 5-second smoke test of full pipeline."""
    # 1. Create worker
    worker = create_test_worker()

    # 2. Create policy
    policy = create_test_policy(worker_id)

    # 3. Simulate DCI >= 65
    create_dci_event(pincode='560001', dci_score=75)

    # 4. Trigger claims
    claims = trigger_claims()
    assert len(claims) > 0

    # 5. Check fraud
    for claim in claims:
        result = check_fraud(claim)
        assert 'decision' in result

    # 6. Settle
    settle_claims()

    # 7. Verify payout
    payouts = get_payouts()
    assert len(payouts) == len(claims)

    print("✅ End-to-end test passed in 4.2 seconds")
```

---

## 🔐 Error Handling & Retry Logic

### API Error Handling

```python
# Graceful degradation pattern
async def get_weather_data(pincode: str):
    try:
        data = await weather_service.fetch(pincode)
        return data
    except httpx.TimeoutException:
        logger.warning(f"Weather API timeout for {pincode}, using fallback")
        return {"rainfall": 0, "temperature": 25}
    except Exception as e:
        logger.error(f"Weather fetch failed: {e}")
        return {"rainfall": 0, "temperature": 25}

# DCI calculation proceeds with fallbacks
dci = calculate_dci(
    weather_score=0,  # Fallback
    aqi_score=50,     # Partial data
    heat_score=30,
    social_score=0,
    platform_score=10
)
```

### Payout Retry Logic

```python
# settlement_service.py
MAX_RETRIES = 3

for claim in pending_claims:
    for attempt in range(MAX_RETRIES):
        try:
            payout = initiate_payout(...)
            break  # Success
        except PaymentException as e:
            if attempt < MAX_RETRIES - 1:
                logger.warning(f"Payout attempt {attempt+1} failed, retrying...")
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
            else:
                logger.error(f"Payout failed after {MAX_RETRIES} attempts")
                mark_payout_failed(claim_id)
```

---

## 📊 Observability & Monitoring

### Structured Logging

```python
# All modules use:
logger.info(
    "DCI calculated",
    extra={
        "pincode": "560001",
        "dci_score": 75,
        "components": {
            "weather": 80,
            "aqi": 65,
            "heat": 70,
            "social": 80,
            "platform": 50
        },
        "duration_ms": 245
    }
)
```

### Performance Metrics to Track

```python
# Example metrics (send to Sentry/Datadog if configured)
metrics = {
    "dci_poller_duration_ms": 245,
    "dci_poller_api_failures": 0,
    "claims_triggered_count": 12,
    "fraud_false_positive_rate": 0.02,
    "payout_settlement_duration_ms": 1500,
    "payout_success_rate": 0.98,
    "database_query_time_ms": 45,
    "external_api_timeouts": 0
}
```

---

## 🚀 Scalability Considerations

### Current Bottlenecks

1. **DCI Poller (5-min intervals)**
   - Calls 5 external APIs sequentially
   - Could be parallelized with `asyncio.gather()`

2. **Settlement Service (once daily)**
   - Processes all pending claims at 11:55 PM
   - Could use batch processing for 1000s of claims

3. **Fraud Detection (real-time)**
   - 3-stage pipeline per claim
   - Could use GPU for faster inference at scale

### Scaling Strategies

```python
# 1. Parallel API calls
dci_scores = await asyncio.gather(
    weather_service.get(...),
    aqi_service.get(...),
    heat_service.get(...),
    social_service.get(...),
    platform_service.get(...)
)

# 2. Batch processing
claims = get_pending_claims(batch_size=100)
for batch in chunks(claims, 100):
    fraud_results = detect_fraud_batch(batch)
    # Process batch

# 3. Connection pooling
app.state.db_pool = create_pool(
    settings.SUPABASE_URL,
    min_size=5,
    max_size=20
)
```

---

## 📋 Integration Checklist for New Features

When adding a new feature, verify:

- [ ] Defined Pydantic request/response models
- [ ] Added database schema (if new table)
- [ ] Added migrations (if schema changed)
- [ ] Implemented service layer logic
- [ ] Added API endpoint with proper error handling
- [ ] Added authentication/authorization checks
- [ ] Added logging at key points
- [ ] Tested with mock external APIs
- [ ] Added smoke test
- [ ] Updated API documentation
- [ ] Added frontend integration
- [ ] Tested end-to-end locally
- [ ] Verified performance metrics

