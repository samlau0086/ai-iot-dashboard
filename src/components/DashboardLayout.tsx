import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function DashboardLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0f1115] dark:text-slate-300 font-sans">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
