import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Routes, Route, useLocation } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { Overview } from './views/Overview';
import { Devices } from './views/Devices';
import { Alerts } from './views/Alerts';
import { Analytics } from './views/Analytics';
import { RawData } from './views/RawData';
import { Workflows } from './views/Workflows';
import { ControlCenter } from './views/ControlCenter';
import { ScadaView } from './views/ScadaView';
import { AccessControl } from './views/AccessControl';
import { Reports } from './views/Reports';
import { AIInsights } from './views/AIInsights';
import { Settings } from './views/Settings';
import { Profile } from './views/Profile';
import { ClaimDevice } from './views/ClaimDevice';
import { useAppStore } from './lib/store';
import { useDeviceDataConnection } from './hooks/useDeviceDataConnection';
import { Auth } from './views/Auth';
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog';
import { ToastHost } from './components/ToastHost';
import { canAccessPath, getDefaultRouteForUser } from './lib/featureAccess';

import { DeviceDetails } from './views/DeviceDetails';

function ProtectedRoute() {
  const currentUser = useAppStore((state) => state.currentUser);
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <>
      <DeviceDataConnection />
      <Outlet />
    </>
  );
}

function FeatureRoute() {
  const currentUser = useAppStore((state) => state.currentUser);
  const location = useLocation();

  if (!canAccessPath(currentUser, location.pathname)) {
    return <Navigate to={getDefaultRouteForUser(currentUser)} replace />;
  }

  return <Outlet />;
}

function HomeRoute() {
  const currentUser = useAppStore((state) => state.currentUser);
  const defaultRoute = getDefaultRouteForUser(currentUser);

  if (defaultRoute !== '/') {
    return <Navigate to={defaultRoute} replace />;
  }

  return <Overview />;
}

function DeviceDataConnection() {
  useDeviceDataConnection();
  return null;
}

export default function App() {
  const { theme, backendHydrated, hydrateBackendState } = useAppStore();

  useEffect(() => {
    hydrateBackendState();
  }, [hydrateBackendState]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  if (!backendHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
        Loading AI IoT Dashboard...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ConfirmDeleteDialog />
      <ToastHost />
      <Routes>
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<HomeRoute />} />
            <Route element={<FeatureRoute />}>
              <Route path="devices" element={<Devices />} />
              <Route path="devices/:id" element={<DeviceDetails />} />
              <Route path="claim" element={<ClaimDevice />} />
              <Route path="claim/:token" element={<ClaimDevice />} />
              <Route path="workflows" element={<Workflows />} />
              <Route path="control" element={<ControlCenter />} />
              <Route path="scada" element={<ScadaView />} />
              <Route path="access-control" element={<AccessControl />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="raw-data" element={<RawData />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="reports" element={<Reports />} />
              <Route path="ai-insights" element={<AIInsights />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
