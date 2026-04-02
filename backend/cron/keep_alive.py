"""
cron/keep_alive.py — Backend Self Keep-Alive Service
────────────────────────────────────────────────────

Prevents Render free tier from spinning down by periodically pinging
the backend's own health endpoint. Runs independently of frontend activity.

Wired into APScheduler in main.py — runs every 5 minutes.
"""

import logging
import asyncio
import aiohttp
from datetime import datetime

logger = logging.getLogger("gigkavach.keep_alive")


async def run_keep_alive():
    """
    Self-ping the health endpoint to keep the backend awake on Render.
    This runs on the backend itself, so it keeps the service warm even
    when no frontend is open.
    """
    try:
        # Use localhost since this runs on the same process
        url = "http://localhost:8000/health"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200 or response.status == 307:
                    logger.debug(f"[KEEP-ALIVE] Health check passed at {datetime.utcnow().isoformat()}Z")
                else:
                    logger.warning(f"[KEEP-ALIVE] Health check returned {response.status}")
    except asyncio.TimeoutError:
        logger.warning("[KEEP-ALIVE] Health check timed out (acceptable in startup phase)")
    except Exception as e:
        logger.warning(f"[KEEP-ALIVE] Health check failed: {type(e).__name__} (acceptable, self-healing)")
