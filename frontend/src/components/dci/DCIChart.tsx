/**
 * DCIChart — Live DCI Score Time Series Chart
 *
 * Extracted from Dashboard.jsx inline logic.
 * Fetches historical DCI scores per pincode and renders an animated
 * AreaChart with trigger thresholds. Falls back to demo data if the
 * API returns no data (backend poller hasn't run yet).
 */
import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { dciAPI } from '../../api/dci';

interface DCIDataPoint {
  time: string;
  dci: number;
  zone?: string;
}

interface DCIChartProps {
  pincode?: string;
  /** If true, shows a "Live" badge above the chart */
  showLiveBadge?: boolean;
  height?: number;
}

// Fallback demo data — used when the backend poller hasn't run yet
const DEMO_DATA: DCIDataPoint[] = [
  { time: '2:00', dci: 48, zone: 'HSR Layout' },
  { time: '2:05', dci: 52, zone: 'Indiranagar' },
  { time: '2:10', dci: 58, zone: 'Koramangala' },
  { time: '2:15', dci: 65, zone: 'Koramangala' },
  { time: '2:20', dci: 72, zone: 'Koramangala' },
  { time: '2:25', dci: 68, zone: 'Marathahalli' },
  { time: '2:30', dci: 75, zone: 'Whitefield' },
  { time: '2:35', dci: 82, zone: 'Koramangala' },
  { time: '2:40', dci: 78, zone: 'Koramangala' },
  { time: '2:45', dci: 71, zone: 'Electronic City' },
  { time: '2:50', dci: 64, zone: 'HSR Layout' },
  { time: '2:55', dci: 58, zone: 'Indiranagar' },
];

export const DCIChart = ({
  pincode = '560095',
  showLiveBadge = true,
  height = 260,
}: DCIChartProps) => {
  const [data, setData] = useState<DCIDataPoint[]>(DEMO_DATA);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await dciAPI.getByPincode(pincode);
        const history: Record<string, unknown>[] = res?.history_24h ?? [];
        if (history.length > 0) {
          const mapped: DCIDataPoint[] = history
            .slice()                       // don't mutate
            .reverse()                    // oldest → newest (API returns desc)
            .slice(-12)                   // last 12 samples → one per 5 min
            .map((row: Record<string, unknown>) => ({
              time: new Date(row.timestamp as string).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }),
              dci: Math.round(Number(row.score) || 0),
            }));
          setData(mapped);
          setIsLive(true);
        }
      } catch {
        // Silently fall back to demo data — backend may not have data yet
      }
    };

    load();
    // Refresh every 5 minutes, same cadence as DCI poller
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [pincode]);

  return (
    <div className="w-full">
      {showLiveBadge && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 px-3 py-1.5 rounded-full border border-red-200 dark:border-red-800">
            <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-600 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">
              {isLive ? 'Live' : 'Demo'}
            </span>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Pincode {pincode} · last 60 min
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dciGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="time" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
          <YAxis
            domain={[0, 100]}
            stroke="#9CA3AF"
            tick={{ fontSize: 11 }}
            label={{ value: 'DCI', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '12px',
            }}
            formatter={(value: number | string) => [`${value}`, 'DCI Score']}
            labelFormatter={(l) => `Time: ${l}`}
          />
          <ReferenceLine
            y={65}
            stroke="#FF6B35"
            strokeDasharray="5 5"
            label={{
              value: 'Trigger (65)',
              position: 'insideRight',
              fill: '#FF6B35',
              fontSize: 10,
            }}
          />
          <ReferenceLine
            y={85}
            stroke="#EF4444"
            strokeDasharray="5 5"
            label={{
              value: 'Catastrophic (85)',
              position: 'insideRight',
              fill: '#EF4444',
              fontSize: 10,
            }}
          />
          <Area
            type="monotone"
            dataKey="dci"
            stroke="#FF6B35"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#dciGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DCIChart;
