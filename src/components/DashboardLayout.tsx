import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileTabBar } from './MobileTabBar';

export function DashboardLayout() {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50 font-sans text-slate-900 dark:bg-[#0f1115] dark:text-slate-300">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-3 py-4 pb-28 sm:px-6 sm:py-6 lg:px-8 lg:py-8 lg:pb-8">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
