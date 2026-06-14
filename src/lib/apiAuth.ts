import type { User } from './store';

export const apiActorHeaders = (user?: User | null): Record<string, string> => {
  if (!user) return {};
  return {
    'x-iot-user-id': user.id,
    'x-iot-user-name': encodeURIComponent(user.name || ''),
    'x-iot-user-role': user.role,
  };
};

export const apiJsonHeaders = (user?: User | null): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...apiActorHeaders(user),
});
