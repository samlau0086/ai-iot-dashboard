import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BrainCircuit, CheckCircle2, Languages, Moon, Search, Sun } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { deriveAlertsFromDevices } from '../lib/derivedData';

export function Header() {
  const { language, setLanguage, theme, toggleTheme, devices, currentUser, sites, activeSiteId, setActiveSite } = useAppStore();
  const t = translations[language];
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotificationKeys, setReadNotificationKeys] = useState<string[]>([]);
  const [notificationReadStateReady, setNotificationReadStateReady] = useState(false);
  const [systemNotificationsReady, setSystemNotificationsReady] = useState(false);
  const [systemNotifications, setSystemNotifications] = useState<Array<{ id: string; title: string; message: string; level: string; createdAt: string }>>([]);
  const alerts = useMemo(() => deriveAlertsFromDevices(devices), [devices]);
  const notifications = useMemo(() => [
    ...systemNotifications.map((notification) => ({
      id: notification.id,
      title: notification.title || 'System Notification',
      message: notification.message,
      level: notification.level || 'Info',
      timestamp: notification.createdAt,
      source: 'workflow',
    })),
    ...alerts.map((alert) => ({
      id: alert.id,
      title: alert.deviceName,
      message: alert.message,
      level: alert.level,
      timestamp: alert.timestamp,
      source: 'telemetry',
    })),
  ].sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime()), [alerts, systemNotifications]);
  const notificationStorageKey = `ai-iot-dashboard-read-notifications:${currentUser?.id || 'guest'}`;
  const notificationKey = (notification: typeof notifications[number]) => `${notification.source}:${notification.id}`;
  const legacyNotificationKey = (notification: typeof notifications[number]) => `${notification.source}:${notification.id}:${notification.timestamp}`;
  const isNotificationRead = (notification: typeof notifications[number]) => (
    readNotificationKeys.includes(notificationKey(notification))
    || readNotificationKeys.includes(legacyNotificationKey(notification))
  );
  const unreadAlerts = notifications.filter((notification) => !isNotificationRead(notification));
  const hasUnreadNotifications = unreadAlerts.length > 0;
  const persistReadNotificationKeys = (keys: string[]) => {
    try {
      window.localStorage.setItem(notificationStorageKey, JSON.stringify(keys));
    } catch {
      // Local read state is a convenience feature; failures should not block navigation.
    }
  };
  const markNotificationRead = (notification: typeof notifications[number]) => {
    const key = notificationKey(notification);
    setReadNotificationKeys((current) => {
      const nextKeys = current.includes(key) ? current : [...current, key];
      persistReadNotificationKeys(nextKeys);
      return nextKeys;
    });
  };
  const markAllNotificationsRead = () => {
    const keys = notifications.map(notificationKey);
    setReadNotificationKeys((current) => {
      const nextKeys = Array.from(new Set([...current, ...keys]));
      persistReadNotificationKeys(nextKeys);
      return nextKeys;
    });
  };

  useEffect(() => {
    let cancelled = false;
    const loadSystemNotifications = async () => {
      try {
        const response = await fetch('/api/system-notifications?limit=100');
        const payload = await response.json();
        if (!cancelled) {
          setSystemNotifications(response.ok && Array.isArray(payload.notifications) ? payload.notifications : []);
          setSystemNotificationsReady(true);
        }
      } catch {
        if (!cancelled) {
          setSystemNotifications([]);
          setSystemNotificationsReady(true);
        }
      }
    };
    loadSystemNotifications();
    const intervalId = window.setInterval(loadSystemNotifications, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setNotificationReadStateReady(false);
    try {
      const stored = window.localStorage.getItem(notificationStorageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      const migrated = Array.isArray(parsed)
        ? parsed.map((key) => String(key).split(':').slice(0, 2).join(':')).filter(Boolean)
        : [];
      setReadNotificationKeys(Array.from(new Set(migrated)));
    } catch {
      setReadNotificationKeys([]);
    } finally {
      setNotificationReadStateReady(true);
    }
  }, [notificationStorageKey]);

  useEffect(() => {
    if (!notificationReadStateReady || !systemNotificationsReady) return;
    try {
      const activeKeys = new Set(notifications.map(notificationKey));
      const nextReadKeys = readNotificationKeys.filter((key) => activeKeys.has(key));
      window.localStorage.setItem(notificationStorageKey, JSON.stringify(nextReadKeys));
      if (nextReadKeys.length !== readNotificationKeys.length) {
        setReadNotificationKeys(nextReadKeys);
      }
    } catch {
      // Local read state is a convenience feature; failures should not block navigation.
    }
  }, [notifications, notificationReadStateReady, notificationStorageKey, readNotificationKeys, systemNotificationsReady]);

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
              aria-expanded={showNotifications}
              className="-m-2.5 p-2.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white relative"
            >
              <span className="sr-only">View notifications</span>
              <Bell className="h-5 w-5" aria-hidden="true" />
              {hasUnreadNotifications && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-[#16191f]" />
              )}
            </button>
            
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)}></div>
                <div className="fixed left-3 right-3 top-16 z-20 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-[#1c2128] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800/50">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {hasUnreadNotifications ? `${unreadAlerts.length} unread` : 'All caught up'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasUnreadNotifications && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:bg-red-500/10 dark:text-red-300">
                          New
                        </span>
                      )}
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          disabled={!hasUnreadNotifications}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mark all as read
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map(notification => (
                      <div
                        key={notificationKey(notification)}
                        className="flex gap-3 border-b border-slate-50 px-4 py-3 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800/30 dark:hover:bg-slate-800/50"
                      >
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isNotificationRead(notification) ? 'bg-slate-300 dark:bg-slate-700' : 'bg-red-500'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-300">{notification.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{notification.message}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                markNotificationRead(notification);
                              }}
                              disabled={isNotificationRead(notification)}
                              title={isNotificationRead(notification) ? 'Read' : 'Mark read'}
                              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {notification.level}
                            </span>
                            <p className="font-mono text-[10px] text-slate-400">
                              {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit'})}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {notifications.length === 0 && (
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
