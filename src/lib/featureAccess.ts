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
  | 'settings'
  | 'profile';

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
  full: new Set(['overview', 'devices', 'claim', 'workflows', 'control', 'scada', 'accessControl', 'analytics', 'rawData', 'alerts', 'reports', 'ai', 'settings', 'profile']),
};

export const getUserAppProfile = (user?: Pick<User, 'role' | 'appProfile'> | null): AppProfile => {
  if (user?.appProfile) return user.appProfile;
  if (user?.role === 'Customer') return 'simple';
  if (user?.role === 'Operator' || user?.role === 'Viewer') return 'operations';
  return 'full';
};

export const canAccessFeature = (user: Pick<User, 'role' | 'appProfile'> | null | undefined, feature: FeatureNavKey) => (
  PROFILE_FEATURES[getUserAppProfile(user)].has(feature)
);

export const getDefaultRouteForUser = (user: Pick<User, 'role' | 'appProfile'> | null | undefined) => {
  const profile = getUserAppProfile(user);
  if (profile === 'simple') return '/devices';
  return '/';
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
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/profile')) return 'profile';
  return 'overview';
};

export const canAccessPath = (user: Pick<User, 'role' | 'appProfile'> | null | undefined, pathname: string) => (
  canAccessFeature(user, getFeatureForPath(pathname))
);
