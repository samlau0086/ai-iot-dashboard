import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Server, 
  Activity, 
  Bell, 
  FileText, 
  BrainCircuit, 
  Settings,
  GitMerge
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../lib/store';
import { translations, TermKeys } from '../lib/i18n';

const menuItems: { key: keyof typeof translations.en.nav; to: string; icon: any }[] = [
  { key: 'overview', to: '/', icon: LayoutDashboard },
  { key: 'devices', to: '/devices', icon: Server },
  { key: 'workflows', to: '/workflows', icon: GitMerge },
  { key: 'analytics', to: '/analytics', icon: Activity },
  { key: 'alerts', to: '/alerts', icon: Bell },
  { key: 'reports', to: '/reports', icon: FileText },
  { key: 'ai', to: '/ai-insights', icon: BrainCircuit },
  { key: 'settings', to: '/settings', icon: Settings },
];

export function Sidebar() {
  const { language, currentUser } = useAppStore();
  const t = translations[language];

  return (
    <div className="flex w-64 flex-col bg-white dark:bg-[#16191f] text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
      <div className="flex h-16 shrink-0 items-center px-6 bg-slate-50 dark:bg-[#16191f] border-b border-slate-200 dark:border-slate-800">
        <BrainCircuit className="h-6 w-6 text-orange-500 mr-2" />
        <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">AI Operations</span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
        <nav className="flex-1 space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  isActive
                    ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-500'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
                  'group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      isActive ? 'text-orange-600 dark:text-orange-500' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300',
                      'mr-3 h-5 w-5 flex-shrink-0 transition-colors'
                    )}
                    aria-hidden="true"
                  />
                  {/* @ts-ignore */}
                  {t.nav[item.key]}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <NavLink to="/profile" className="flex items-center hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-md transition-colors w-full">
          <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-white font-medium text-sm border border-slate-300 dark:border-slate-600">
            {currentUser?.name?.charAt(0) || 'U'}
          </div>
          <div className="ml-3 text-left">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{currentUser?.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{currentUser?.siteId}</p>
          </div>
        </NavLink>
      </div>
    </div>
  );
}
