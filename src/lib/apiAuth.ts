import type { User } from './store';

const API_SESSION_TOKEN_KEY = 'ai-iot-dashboard-session-token';

export const getApiSessionToken = () => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(API_SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setApiSessionToken = (token: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(API_SESSION_TOKEN_KEY, token);
  } catch {
    // Ignore storage failures; protected APIs will reject missing sessions.
  }
};

export const clearApiSessionToken = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(API_SESSION_TOKEN_KEY);
  } catch {
    // Ignore storage failures.
  }
};

export const apiActorHeaders = (user?: User | null): Record<string, string> => {
  const sessionToken = getApiSessionToken();
  if (!user) return sessionToken ? { 'x-iot-session-token': sessionToken } : {};
  return {
    'x-iot-user-id': user.id,
    'x-iot-user-name': encodeURIComponent(user.name || ''),
    'x-iot-user-role': user.role,
    ...(sessionToken ? { 'x-iot-session-token': sessionToken } : {}),
  };
};

export const apiJsonHeaders = (user?: User | null): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...apiActorHeaders(user),
});
