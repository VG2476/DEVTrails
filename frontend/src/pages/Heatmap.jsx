/**
 * Heatmap Page
 * 
 * Thin wrapper around the DCIHeatmap reusable component.
 * All map + pie chart logic has been extracted to:
 *   frontend/src/components/dci/DCIHeatmap.tsx
 */
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DCIHeatmap } from '../components/dci/DCIHeatmap';
import 'leaflet/dist/leaflet.css';

export const Heatmap = () => {
  const [key, setKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Force re-mount DCIHeatmap so it re-fetches fresh data
    setKey((k) => k + 1);
    setTimeout(() => setIsRefreshing(false), 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Live Heatmap</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Real-time DCI zone status · Pie chart reflects actual disruption type weights per event
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* DCIHeatmap component — map + dynamic pie sidebar */}
      <DCIHeatmap key={key} />
    </div>
  );
};
