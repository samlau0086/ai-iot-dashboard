import type { User } from './store';

export type AppProfile = 'simple' | 'operations' | 'automation' | 'full';

export type FeatureNavKey =
  | 'overview'
  | 'devices'
  | 'claim'
  | 'workflows'
  | 'control'
  | 'scada'
  | 'accessControl'
  | 'analytics'
  | 'rawData'
  | 'alerts'
  | 'reports'
  | 'ai'
  | 'partner'
  | 'settings'
  | 'profile';

export type FeatureAccessMap = Partial<Record<FeatureNavKey, boolean>>;

export const FEATURE_ACCESS_OPTIONS: Array<{ key: FeatureNavKey; label: string; description: string }> = [
  { key: 'overview', label: 'Overview', description: 'Operations dashboard and site-level widgets.' },
  { key: 'devices', label: 'Devices', description: 'Device list, details, provisioning, and device operations.' },
  { key: 'claim', label: 'Claim Device', description: 'MAC / IMEI / Serial Number claim flow.' },
  { key: 'workflows', label: 'Workflows', description: 'Automation workflows and workflow logs.' },
  { key: 'control', label: 'Control Center', description: 'Remote command dispatch and command history.' },
  { key: 'scada', label: 'SCADA', description: 'SCADA operations view and visual scenes.' },
  { key: 'accessControl', label: 'Access Control', description: 'QR / NFC access credentials and records.' },
  { key: 'analytics', label: 'Analytics', description: 'Charts, reports, and metric analysis.' },
  { key: 'rawData', label: 'Raw Data', description: 'Raw telemetry query and diagnostics.' },
  { key: 'alerts', label: 'Alerts', description: 'Alert center and alert handling.' },
  { key: 'reports', label: 'Reports', description: 'Operational report management.' },
  { key: 'ai', label: 'AI Copilot', description: 'AI insights and assistant workflows.' },
  { key: 'partner', label: 'Partner', description: 'Customer, project, white-label, and partner delivery settings.' },
  { key: 'settings', label: 'Settings', description: 'System settings, users, data sources, and tokens.' },
  { key: 'profile', label: 'Profile', description: 'Own account profile.' },
];

export const APP_PROFILE_OPTIONS: Array<{ value: AppProfile; label: string; description: string }> = [
  {
    value: 'simple',
    label: 'Simple Device App',
    description: 'Device list, claim/bind flow, device details, and device operations only.',
  },
  {
    value: 'operations',
    label: 'Operations Dashboard',
    description: 'Overview, devices, control center, analytics, alerts, and reports.',
  },
  {
    value: 'automation',
    label: 'Automation / SCADA',
    description: 'Operations features plus SCADA, Access Control, workflows, and raw data.',
  },
  {
    value: 'full',
    label: 'Full Platform',
    description: 'All platform modules, including system settings and user management.',
  },
];

const PROFILE_FEATURES: Record<AppProfile, Set<FeatureNavKey>> = {
  simple: new Set(['devices', 'claim', 'profile']),
  operations: new Set(['overview', 'devices', 'claim', 'control', 'analytics', 'alerts', 'reports', 'ai', 'profile']),
  automation: new Set(['overview', 'devices', 'claim', 'workflows', 'control', 'scada', 'accessControl', 'analytics', 'rawData', 'alerts', 'reports', 'ai', 'profile']),
  full: new Set(['overview', 'devices', 'claim', 'workflows', 'control', 'scada', 'accessControl', 'analytics', 'rawData', 'alerts', 'reports', 'ai', 'partner', 'settings', 'profile']),
};

const DEFAULT_ROUTE_PRIORITY: Array<{ key: FeatureNavKey; to: string }> = [
  { key: 'overview', to: '/' },
  { key: 'devices', to: '/devices' },
  { key: 'claim', to: '/claim' },
  { key: 'workflows', to: '/workflows' },
  { key: 'control', to: '/control' },
  { key: 'scada', to: '/scada' },
  { key: 'accessControl', to: '/access-control' },
  { key: 'analytics', to: '/analytics' },
  { key: 'rawData', to: '/raw-data' },
  { key: 'alerts', to: '/alerts' },
  { key: 'reports', to: '/reports' },
  { key: 'ai', to: '/ai-insights' },
  { key: 'partner', to: '/partner' },
  { key: 'settings', to: '/settings' },
  { key: 'profile', to: '/profile' },
];

export const getUserAppProfile = (user?: Pick<User, 'role' | 'appProfile'> | null): AppProfile => {
  if (user?.appProfile) return user.appProfile;
  if (user?.role === 'Partner') return 'full';
  if (user?.role === 'Customer') return 'simple';
  if (user?.role === 'Operator' || user?.role === 'Viewer') return 'operations';
  return 'full';
};

export const getUserFeatureAccess = (user?: Pick<User, 'role' | 'appProfile' | 'featureAccess'> | null) => {
  const profileFeatures = PROFILE_FEATURES[getUserAppProfile(user)];
  const access = FEATURE_ACCESS_OPTIONS.reduce((current, option) => ({
    ...current,
    [option.key]: profileFeatures.has(option.key),
  }), {} as Record<FeatureNavKey, boolean>);

  Object.entries(user?.featureAccess || {}).forEach(([key, enabled]) => {
    if (typeof enabled === 'boolean' && key in access) {
      access[key as FeatureNavKey] = enabled;
    }
  });

  access.profile = true;
  return access;
};

export const canAccessFeature = (user: Pick<User, 'role' | 'appProfile' | 'featureAccess'> | null | undefined, feature: FeatureNavKey) => (
  Boolean(getUserFeatureAccess(user)[feature])
);

export const getDefaultRouteForUser = (user: Pick<User, 'role' | 'appProfile' | 'featureAccess'> | null | undefined) => {
  const access = getUserFeatureAccess(user);
  return DEFAULT_ROUTE_PRIORITY.find((route) => access[route.key])?.to || '/profile';
};

export const getFeatureForPath = (pathname: string): FeatureNavKey => {
  if (pathname === '/' || pathname === '') return 'overview';
  if (pathname.startsWith('/devices')) return 'devices';
  if (pathname.startsWith('/claim')) return 'claim';
  if (pathname.startsWith('/workflows')) return 'workflows';
  if (pathname.startsWith('/control')) return 'control';
  if (pathname.startsWith('/scada')) return 'scada';
  if (pathname.startsWith('/access-control')) return 'accessControl';
  if (pathname.startsWith('/analytics')) return 'analytics';
  if (pathname.startsWith('/raw-data')) return 'rawData';
  if (pathname.startsWith('/alerts')) return 'alerts';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/ai-insights')) return 'ai';
  if (pathname.startsWith('/partner')) return 'partner';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/profile')) return 'profile';
  return 'overview';
};

export const canAccessPath = (user: Pick<User, 'role' | 'appProfile' | 'featureAccess'> | null | undefined, pathname: string) => (
  canAccessFeature(user, getFeatureForPath(pathname))
);
