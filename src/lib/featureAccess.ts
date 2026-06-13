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

export type ControlAccessConfig = {
  enabled?: boolean;
  deviceIds?: string[];
  actionIds?: string[];
};

export type DataAccessConfig = {
  enabled?: boolean;
  siteIds?: string[];
  deviceIds?: string[];
};

type AccessUser = {
  siteId?: string;
  role?: string;
  appProfile?: AppProfile;
  featureAccess?: FeatureAccessMap;
  controlAccess?: ControlAccessConfig;
  dataAccess?: DataAccessConfig;
};

type AccessSite = {
  id: string;
};

type AccessDevice = {
  id: string;
  siteId?: string;
};

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

export const getUserAppProfile = (user?: AccessUser | null): AppProfile => {
  if (user?.appProfile) return user.appProfile;
  if (user?.role === 'Partner') return 'full';
  if (user?.role === 'Customer') return 'simple';
  if (user?.role === 'Operator' || user?.role === 'Viewer') return 'operations';
  return 'full';
};

export const getUserFeatureAccess = (user?: AccessUser | null) => {
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

export const canAccessFeature = (user: AccessUser | null | undefined, feature: FeatureNavKey) => (
  Boolean(getUserFeatureAccess(user)[feature])
);

export const canIssueControlCommand = (
  user: AccessUser | null | undefined,
  deviceId?: string,
  actionId?: string
) => {
  if (!user || user.role === 'Demo') return false;
  if (!['Owner', 'Admin', 'Engineer', 'Operator', 'Customer'].includes(user.role)) return false;

  const config = user.controlAccess;
  if (config?.enabled === false) return false;
  if (config?.deviceIds?.length && deviceId && !config.deviceIds.includes(deviceId)) return false;
  if (config?.actionIds?.length && actionId && !config.actionIds.includes(actionId)) return false;

  return true;
};

const hasFullDataAccessByRole = (user: AccessUser | null | undefined) => (
  ['Owner', 'Admin', 'Partner', 'Demo'].includes(user?.role || '')
);

export const hasFullDataAccess = (user: AccessUser | null | undefined) => {
  if (!user) return false;
  if (user.dataAccess?.enabled === false) return false;
  if (user.dataAccess?.siteIds?.length || user.dataAccess?.deviceIds?.length) return false;
  return hasFullDataAccessByRole(user);
};

export const canAccessSiteData = (user: AccessUser | null | undefined, siteId?: string) => {
  if (!user) return false;
  if (!siteId) return true;

  const config = user.dataAccess;
  if (config?.enabled === false) return false;
  if (config?.siteIds?.length) return config.siteIds.includes(siteId);
  if (hasFullDataAccessByRole(user)) return true;

  return !user.siteId || user.siteId === siteId;
};

export const canAccessDeviceData = (user: AccessUser | null | undefined, device?: AccessDevice | null) => {
  if (!user || !device) return false;

  const config = user.dataAccess;
  if (config?.enabled === false) return false;
  if (config?.deviceIds?.length) return config.deviceIds.includes(device.id);
  return canAccessSiteData(user, device.siteId);
};

export const getAccessibleSites = <T extends AccessSite>(user: AccessUser | null | undefined, sites: T[]) => (
  sites.filter((site) => canAccessSiteData(user, site.id))
);

export const getAccessibleDevices = <T extends AccessDevice>(user: AccessUser | null | undefined, devices: T[]) => (
  devices.filter((device) => canAccessDeviceData(user, device))
);

export const getDefaultRouteForUser = (user: AccessUser | null | undefined) => {
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

export const canAccessPath = (user: AccessUser | null | undefined, pathname: string) => (
  canAccessFeature(user, getFeatureForPath(pathname))
);
