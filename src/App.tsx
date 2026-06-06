import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { Overview } from './views/Overview';
import { Devices } from './views/Devices';
import { Alerts } from './views/Alerts';
import { Analytics } from './views/Analytics';
import { Workflows } from './views/Workflows';
import { Reports } from './views/Reports';
import { AIInsights } from './views/AIInsights';
import { Settings } from './views/Settings';
import { Profile } from './views/Profile';
import { useAppStore } from './lib/store';
import { useDeviceDataConnection } from './hooks/useDeviceDataConnection';

import { DeviceDetails } from './views/DeviceDetails';

export default function App() {
  const { theme } = useAppStore();
  useDeviceDataConnection();

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:id" element={<DeviceDetails />} />
          <Route path="workflows" element={<Workflows />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="ai-insights" element={<AIInsights />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
