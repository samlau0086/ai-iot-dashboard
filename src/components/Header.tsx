import React, { useState } from 'react';
import { Bell, BrainCircuit, Languages, Moon, Search, Sun } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { deriveAlertsFromDevices } from '../lib/derivedData';

export function Header() {
  const { language, setLanguage, theme, toggleTheme, devices, currentUser, sites, activeSiteId, setActiveSite } = useAppStore();
  const t = translations[language];
  const [showNotifications, setShowNotifications] = useState(false);
  const alerts = deriveAlertsFromDevices(devices);

  return (
    <header className="relative z-[40] flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-3 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-[#16191f]/80 sm:h-16 sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 gap-x-3 self-stretch lg:gap-x-6">
        <div className="flex min-w-0 items-center gap-2 sm:hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
            <BrainCircuit className="h-5 w-5 text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">AI IoT Dashboard</p>
            <p className="truncate text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {currentUser?.role || 'Operator'}
            </p>
          </div>
        </div>

        <form className="relative hidden flex-1 sm:flex" action="#" method="GET">
          <label htmlFor="search-field" className="sr-only">
            Search
          </label>
          <Search
            className="pointer-events-none absolute inset-y-0 left-0 h-full w-5 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="search-field"
            className="block h-full w-full border-0 bg-transparent py-0 pl-8 pr-0 text-slate-900 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0 sm:text-sm outline-none"
            placeholder={t.common.search}
            type="search"
            name="search"
          />
        </form>
        <div className="ml-auto flex items-center gap-x-1 sm:gap-x-4 lg:gap-x-6">
          <select
            value={activeSiteId}
            onChange={(event) => setActiveSite(event.target.value)}
            className="hidden h-9 max-w-[180px] rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none hover:border-slate-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 lg:block"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
          <button 
            type="button" 
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="m-0 p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1 text-sm font-medium"
          >
            <Languages className="h-5 w-5" />
            <span className="hidden sm:inline">{language === 'en' ? 'EN' : 'ZH'}</span>
          </button>
          
          <button 
            type="button" 
            onClick={toggleTheme}
            className="m-0 p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <span className="sr-only">Toggle theme</span>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <div className="relative">
            <button 
              type="button" 
              onClick={() => setShowNotifications(!showNotifications)}
              className="-m-2.5 p-2.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white relative"
            >
              <span className="sr-only">View notifications</span>
              <Bell className="h-5 w-5" aria-hidden="true" />
              {alerts.some(a => a.status === 'active') && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-[#16191f]" />
              )}
            </button>
            
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)}></div>
                <div className="fixed left-3 right-3 top-16 z-20 rounded-lg border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-700 dark:bg-[#1c2128] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/50">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Notifications</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {alerts.slice(0, 5).map(alert => (
                      <div key={alert.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-50 dark:border-slate-800/30 last:border-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-300">{alert.deviceName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{alert.message}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-1 w-full text-right">
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                    ))}
                    {alerts.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        No telemetry alerts
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
