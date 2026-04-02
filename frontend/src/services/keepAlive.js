/**
 * Backend Keep-Alive Service
 * 
 * Prevents Render free tier from spinning down the backend by periodically
 * pinging the health endpoint. Runs silently in the background.
 * 
 * Usage:
 *   import { useBackendKeepAlive } from './services/keepAlive';
 *   // In your root App component:
 *   useBackendKeepAlive();
 */

import { useEffect } from 'react';

const HEALTH_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes
const HEALTH_ENDPOINT = '/health';

let keepAliveIntervalId = null;

/**
 * Start background keep-alive pings to prevent backend spin-down
 */
const startKeepAlive = () => {
  if (keepAliveIntervalId) return; // Already running

  const ping = async () => {
    try {
      const baseUrl =
        import.meta.env.PROD
          ? 'https://devtrails-backend-dnlr.onrender.com'
          : import.meta.env.VITE_BACKEND_PROXY_TARGET ||
            'https://devtrails-backend-dnlr.onrender.com';

      const url = `${baseUrl}${HEALTH_ENDPOINT}`;

      // Silent fetch with timeout - no error logging in normal operation
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        // Add a marker header so Render logs show these are keep-alive pings
        headers: { 'X-Keep-Alive': 'true' },
      })
        .then(() => {
          clearTimeout(timeoutId);
          // Silently successful - no need to log
        })
        .catch(() => {
          clearTimeout(timeoutId);
          // Silently fail - if backend is actually down, other API calls will catch it
        });
    } catch {
      // Final catch - still silent
    }
  };

  // Initial ping
  ping();

  // Schedule recurring pings
  keepAliveIntervalId = setInterval(ping, HEALTH_CHECK_INTERVAL);
};

/**
 * Stop background keep-alive pings
 */
const stopKeepAlive = () => {
  if (keepAliveIntervalId) {
    clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = null;
  }
};

/**
 * React Hook: Start keep-alive on mount, stop on unmount
 */
export const useBackendKeepAlive = () => {
  useEffect(() => {
    startKeepAlive();
    return () => stopKeepAlive();
  }, []);
};

/**
 * Export standalone functions for non-React usage
 */
export { startKeepAlive, stopKeepAlive };
