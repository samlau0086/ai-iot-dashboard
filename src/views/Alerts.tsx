import React from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { deriveAlertsFromDevices } from '../lib/derivedData';

export function Alerts() {
  const { language, devices } = useAppStore();
  const t = translations[language];
  const alerts = deriveAlertsFromDevices(devices);

  const getIcon = (level: string) => {
    switch (level) {
      case 'Emergency':
      case 'Critical': return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'Warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'Info': return <Info className="h-5 w-5 text-blue-500" />;
      default: return <Info className="h-5 w-5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.alerts.title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t.alerts.desc}
          </p>
        </div>
      </div>
      
      <div className="flex flex-col gap-4">
        {alerts.map((alert) => (
          <div key={alert.id} className="bg-white dark:bg-[#1c2128] p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 mt-0.5">
                {getIcon(alert.level)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-300">{alert.deviceName}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit'})}
                    </span>
                    <span className={cn(
                      "inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight",
                      alert.status === 'active' ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500" :
                      alert.status === 'acknowledged' ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500" :
                      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    )}>
                      {alert.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{alert.message}</p>
                
                {alert.status === 'active' && (
                  <div className="mt-4 flex gap-3">
                    <button type="button" className="inline-flex items-center gap-x-1.5 rounded bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 border border-orange-500 shadow-sm">
                      <CheckCircle2 className="-ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
                      {t.alerts.acknowledge}
                    </button>
                    <button type="button" className="inline-flex items-center gap-x-1.5 rounded bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm">
                      {t.alerts.createTicket}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {alerts.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-[#1c2128] dark:text-slate-400">
            No active device alerts generated from current telemetry.
          </div>
        )}
      </div>
    </div>
  );
}
