import React, { useState } from 'react';
import { Bell, Search, Sun, Moon, Languages } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { deriveAlertsFromDevices } from '../lib/derivedData';

export function Header() {
  const { language, setLanguage, theme, toggleTheme, devices } = useAppStore();
  const t = translations[language];
  const [showNotifications, setShowNotifications] = useState(false);
  const alerts = deriveAlertsFromDevices(devices);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-[#16191f]/50 backdrop-blur-md px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 relative z-[40]">
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <form className="relative flex flex-1" action="#" method="GET">
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
        <div className="flex items-center gap-x-4 lg:gap-x-6">
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
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-2 z-20">
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
