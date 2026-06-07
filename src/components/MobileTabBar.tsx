import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  Bell,
  BrainCircuit,
  FileText,
  GitMerge,
  LayoutDashboard,
  Server,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { translations } from '../lib/i18n';
import { useAppStore } from '../lib/store';

const mobileItems: { key: keyof typeof translations.en.nav; to: string; icon: any }[] = [
  { key: 'overview', to: '/', icon: LayoutDashboard },
  { key: 'devices', to: '/devices', icon: Server },
  { key: 'workflows', to: '/workflows', icon: GitMerge },
  { key: 'control', to: '/control', icon: SlidersHorizontal },
  { key: 'analytics', to: '/analytics', icon: Activity },
  { key: 'alerts', to: '/alerts', icon: Bell },
  { key: 'reports', to: '/reports', icon: FileText },
  { key: 'ai', to: '/ai-insights', icon: BrainCircuit },
  { key: 'settings', to: '/settings', icon: Settings },
];

export function MobileTabBar() {
  const { language } = useAppStore();
  const t = translations[language];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-[#16191f]/95 lg:hidden">
      <div className="mobile-tab-scroll flex gap-1 overflow-x-auto pb-[calc(env(safe-area-inset-bottom)+0.45rem)]">
        {mobileItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex min-w-[4.4rem] flex-col items-center justify-center rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors',
                isActive
                  ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'mb-0.5 h-5 w-5 transition-colors',
                    isActive ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'
                  )}
                  aria-hidden="true"
                />
                <span className="max-w-full truncate">{t.nav[item.key]}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
