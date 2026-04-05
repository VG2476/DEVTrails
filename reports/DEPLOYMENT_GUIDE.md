# ✅ COMPLETE DEPLOYMENT & TESTING GUIDE

## Critical Fixes Applied

### 1. Frontend (Vite) Configuration ✅
- Changed vite server host from `localhost` to `0.0.0.0` (accessible from all machines)
- Added `VITE_BACKEND_PROXY_TARGET` configuration support
- Fixed frontend env variables setup in startup script

### 2. Startup Script Optimizations ✅
- Added `--no-optional --ignore-scripts` to npm installs (saves ~500MB)
- Added `--no-cache-dir` to pip installs (saves ~200MB)
- Exports `VITE_BACKEND_PROXY_TARGET` correctly

### 3. API Endpoint Fixes ✅
- Demo endpoint `/api/v1/demo/trigger-disruption` verified and improved
- Better error logging in demo responses
- Workers endpoint properly routed

### 4. WhatsApp Bot Improvements ✅
- Added `JOIN` command as primary entry point for new users
- Enhanced message-handler with better logging
- Added `[MESSAGE_RECEIVED]` and `[MESSAGE_SENT]` console logs

---

## DEPLOYMENT: Local (Development)

### Step 1: Start All Services
```bash
cd /Users/saatwik/Documents/DEVTRAILS/DEVTrails
./startup_suite.sh local
```

This will:
- Start Backend (port 8000)
- Start Frontend (port 3000) 
- Start WhatsApp Bot (port 3001) with QR code display
- Show backend/frontend logs in the background

### Step 2: Scan WhatsApp QR Code
- Look for QR code in terminal after services start
- Scan with your phone's WhatsApp
- Bot will be logged in and ready to receive messages

### Step 3: Access Dashboard
- Frontend: `http://localhost:3000`
- API Docs: `http://localhost:8000/docs`

### Step 4: Test Components

**Test Workers Display:**
```bash
# Run this in another terminal
curl http://localhost:8000/api/v1/workers/
# Should return 50+ workers
```

**Test Demo Console:**
- Click "Judge's Demo Mode" button (bottom right of dashboard)
- Click "Start 5-Factor Test"
- Should trigger disruptions and show success logs

**Test WhatsApp Bot:**
- Message the bot number with: `HELP`, `JOIN`, `START`
- Should receive responses immediately
- Check terminal for `[MESSAGE_RECEIVED]` and `[MESSAGE_SENT]` logs

---

## DEPLOYMENT: Server (Production)

### Step 1: Cleanup Server Disk (⚠️ CRITICAL!)
```bash
cd /path/to/DEVTrails
chmod +x cleanup-server.sh
./cleanup-server.sh
```

This removes large caches and should free 2-3GB:
- Backend `.venv`
- Frontend `node_modules` and `dist`
- Bot `node_modules`  
- System apt cache

Verify: `df -h` should show >1.5GB available

### Step 2: Start Services on Server
```bash
./startup_suite.sh server
```

This automatically configures for server IP (13.51.165.52)

### Step 3: Access from Browser
- Frontend: `http://13.51.165.52:3000`
- API Docs: `http://13.51.165.52:8000/docs`

---

## COMPONENT TESTING

### Workers Dashboard
**Issue Fixed:** Frontend was buffering because:
- Vite was binding to `localhost` only (not accessible from other machines)
- API base URL wasn't properly configured
- Vite proxy wasn't being set up

**Verification:**
```bash
./test-all-endpoints.sh http://localhost:8000
# Should see ✅ for all endpoints
```

Workers should load on dashboard with real data from Supabase.

### Judge Demo Console
**Issue Fixed:** The demo endpoint is now:
- Properly registered at `/api/v1/demo/trigger-disruption`
- Has improved error logging
- Returns score in response

**Testing:**
1. Open dashboard
2. Click "Judge's Demo Mode" button
3. Click "Start 5-Factor Test"
4. Watch logs in console for success/failure

### WhatsApp Bot Messages
**Issue Fixed:** Bot was missing:
- Proper `JOIN` command handling
- Better logging for incoming messages
- Support for new/unsaved contacts

**Testing:**
```bash
./test-whatsapp-bot.sh
# Shows bot testing guide and checklist
```

To send messages:
1. Save bot number 8792525542 in your contacts
2. Send message: `HELP` or `JOIN`
3. Bot should respond immediately
4. Check terminal logs for `[MESSAGE_RECEIVED]` logs

---

## TROUBLESHOOTING

### Frontend Not Loading / Buffering
**Check:**
1. Backend running: `curl http://localhost:8000/docs`
2. Frontend bound to 0.0.0.0: Check vite.config.ts line ~10
3. API URL correct: Check frontend/.env has VITE_API_URL set

**Fix:**
```bash
pkill -f "vite"
cd frontend
npm install --no-optional
npm run dev -- --host 0.0.0.0 --port 3000
```

### Workers Not Displaying
**Check:**
1. API returns data: `curl http://localhost:8000/api/v1/workers/`
2. Frontend fetches correctly: Check browser console (F12)
3. Check if Supabase connection works

**Fix:**
1. Verify Supabase credentials in backend/.env
2. Check database has `workers` table with data
3. Verify API CORS is configured correctly

### Demo Console Not Working
**Check:**
1. Endpoint exists: `curl -X POST http://localhost:8000/api/v1/demo/trigger-disruption -H "Content-Type: application/json" -d '{"factor":"aqi","score":85}'`
2. Database insertions work: Check dci_logs table in Supabase

**Fix:**
1. Check Supabase credentials
2. Verify dci_logs table exists
3. Check backend logs for errors

### WhatsApp Messages Not Received
**Check:**
1. Bot running: `ps aux | grep node`
2. Bot logged in: Look for "WhatsApp bot is ready" in terminal
3. Message reached bot: Look for `[MESSAGE_RECEIVED]` in logs

**Fix:**
1. Restart bot: `pkill node && node whatsapp-bot/bot.js`
2. Clear auth cache: `rm -rf whatsapp-bot/.wwebjs_auth`
3. Rescan QR code
4. Make sure contact is saved in WhatsApp

### Server Deployment Fails
**Check Disk Space:**
```bash
df -h /
# Should have >1.5GB available
```

**Free Space:**
```bash
./cleanup-server.sh
# This should free 2-3GB
```

**Retry:**
```bash
./startup_suite.sh server
```

---

## LOGS & DEBUGGING

### Backend Logs
```bash
tail -f backend/backend.log
# or check nohup.out
```

### Frontend Logs  
```bash
tail -f frontend/frontend.log
# or check browser console (F12)
```

### WhatsApp Bot Logs
- Check terminal where bot is running
- Look for `[MESSAGE_RECEIVED]` and `[MESSAGE_SENT]`
- Check `whatsapp-bot/data/sessions/*.json` for user state

### API Endpoint Testing
```bash
# All endpoints
./test-all-endpoints.sh
# or manually
curl http://localhost:8000/api/v1/health/
curl http://localhost:8000/api/v1/workers/
curl http://localhost:8000/api/v1/dci/560001
```

---

## QUICK REFERENCE

| Service | Port | URL | Status |
|---------|------|-----|--------|
| Frontend | 3000 | http://localhost:3000 | ✅ |
| Backend | 8000 | http://localhost:8000/docs | ✅ |
| WhatsApp Bot | 3001 | Internal | ✅ |

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/health/` | GET | Check backend alive |
| `/api/v1/workers/` | GET | Fetch workers list |
| `/api/v1/dci/{pincode}` | GET | Get DCI score |
| `/api/v1/demo/trigger-disruption` | POST | Trigger demo test |
| `/api/v1/payouts` | GET | Fetch payouts |
| `/docs` | GET | API documentation |

---

## READY TO DEPLOY?

### Local Testing ✅
```bash
./startup_suite.sh local
./test-all-endpoints.sh
./test-whatsapp-bot.sh
```

### Server Deployment ✅
```bash
./cleanup-server.sh
./startup_suite.sh server
./test-all-endpoints.sh http://13.51.165.52:8000
```

All components are now optimized for low-disk deployment and should work on 1.4GB server!
