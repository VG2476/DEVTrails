import React, { useState } from 'react';
import { Play, CheckCircle2, AlertCircle, Loader2, ChevronRight, Info } from 'lucide-react';

const FACTORS = [
  { id: 'rainfall', label: 'Rainfall Disruption', icon: '🌧️', description: 'Simulates heavy monsoon flooding (>80mm/h)' },
  { id: 'aqi', label: 'AQI Health Hazard', icon: '🌫️', description: 'Simulates toxic air quality index (>350)' },
  { id: 'heat', label: 'Extreme Heatwave', icon: '🔥', description: 'Simulates wet-bulb temperature warning (>42°C)' },
  { id: 'social', label: 'Social Disruption', icon: '📢', description: 'Simulates localized bandh / protest activity' },
  { id: 'platform', label: 'Platform Surge', icon: '📦', description: 'Simulates high-demand delivery blockages' },
];

export const JudgeConsole = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [logs, setLogs] = useState([]);

  const runSequence = async () => {
    setIsRunning(true);
    setLogs([]);
    
    for (let i = 0; i < FACTORS.length; i++) {
        setCurrentStep(i);
        const factor = FACTORS[i];
        
        setLogs(prev => [`🚀 Triggering ${factor.label}...`, ...prev]);
        
        try {
            const response = await fetch('/api/v1/demo/trigger-disruption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ factor: factor.id, score: 85 })
            });
            
            if (response.ok) {
                setLogs(prev => [`✅ Payout triggered for ${factor.id.toUpperCase()}`, ...prev]);
            } else {
                setLogs(prev => [`❌ Failed to trigger ${factor.id}`, ...prev]);
            }
        } catch (err) {
            setLogs(prev => [`❌ Network Error: ${err.message}`, ...prev]);
        }
        
        // Wait 3 seconds for the dashboard to refresh and judge to see it
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    setCurrentStep(-1);
    setIsRunning(false);
    setLogs(prev => [`🏁 Demo Sequence Completed!`, ...prev]);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-gigkavach-orange hover:bg-orange-600 text-white p-4 rounded-full shadow-2xl z-50 flex items-center gap-2 font-bold transition-all transform hover:scale-110 active:scale-95"
      >
        <Play className="w-5 h-5 fill-current" />
        Judge's Demo Mode
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-white dark:bg-gigkavach-surface rounded-xl shadow-2xl border-2 border-gigkavach-orange z-50 overflow-hidden flex flex-col max-h-[500px]">
      {/* Header */}
      <div className="bg-gigkavach-orange p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Play className="w-5 h-5 fill-current" />
          <span className="font-bold">Judge's Demo Console</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white font-bold">✕</button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {/* Intro */}
        <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800 flex gap-3">
          <Info className="w-5 h-5 text-gigkavach-orange flex-shrink-0 mt-0.5" />
          <p className="text-xs text-orange-900 dark:text-orange-200">
            This console triggers 5 sequential tests. Each parameter will independently bridge the 65-DCI threshold to demonstrate automated payouts.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {FACTORS.map((f, idx) => (
            <div 
              key={f.id}
              className={`p-3 rounded-lg border transition-all flex items-center justify-between ${
                currentStep === idx 
                  ? 'border-gigkavach-orange bg-orange-50 dark:bg-orange-900/20 animate-pulse' 
                  : currentStep > idx 
                  ? 'border-green-200 bg-green-50 dark:bg-green-900/20 opacity-60'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{f.icon}</span>
                <div>
                    <p className="text-sm font-bold dark:text-white">{f.label}</p>
                    <p className="text-[10px] text-gray-500">{f.description}</p>
                </div>
              </div>
              {currentStep === idx ? (
                <Loader2 className="w-4 h-4 text-gigkavach-orange animate-spin" />
              ) : currentStep > idx ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </div>
          ))}
        </div>

        {/* Action */}
        <button
          onClick={runSequence}
          disabled={isRunning}
          className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
            isRunning 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
              : 'bg-gigkavach-orange text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20'
          }`}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Sequence Running...
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              Start 5-Factor Test
            </>
          )}
        </button>

        {/* Logs */}
        {logs.length > 0 && (
            <div className="bg-black/90 p-3 rounded-lg font-mono text-[10px] text-green-400 space-y-1 h-24 overflow-y-auto">
                {logs.map((log, i) => (
                    <div key={i}>{log}</div>
                ))}
            </div>
        )}
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-800 p-2 text-center border-t border-gray-200 dark:border-gray-700">
          <p className="text-[10px] text-gray-400">Targeting Worker ID: 49766... (Admin)</p>
      </div>
    </div>
  );
};
