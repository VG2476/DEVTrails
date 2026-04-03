/**
 * Vitest global test setup
 * Runs once before all test files.
 */
import '@testing-library/jest-dom';

// ── Mock leaflet (Leaflet uses DOM APIs not available in jsdom) ──────────────
vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({
      setView: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    circleMarker: vi.fn(() => ({
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
    })),
    DomUtil: {
      get: vi.fn(() => null),
    },
  },
}));

// ── Silence ResizeObserver (not in jsdom) ────────────────────────────────────
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ── Suppress recharts SVG warnings ──────────────────────────────────────────
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('SVGElement') || args[0].includes('recharts'))
    ) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
