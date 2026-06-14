export type PasswordPolicyResult = {
  ok: boolean;
  message: string;
};

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  'admin123',
  'demo123',
  '123456',
  '12345678',
  'qwerty123',
  'letmein',
  'welcome123',
]);

export const PASSWORD_POLICY_DESCRIPTION = 'Use at least 10 characters and include at least 3 of: uppercase, lowercase, number, symbol.';

export const validatePasswordPolicy = (password: string, identity = ''): PasswordPolicyResult => {
  const value = String(password || '');
  const normalized = value.toLowerCase();
  const identityParts = String(identity || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 4);

  if (value.length < 10) {
    return { ok: false, message: 'Password must be at least 10 characters.' };
  }
  if (COMMON_WEAK_PASSWORDS.has(normalized)) {
    return { ok: false, message: 'Password is too common. Please choose a stronger password.' };
  }
  if (identityParts.some((part) => normalized.includes(part))) {
    return { ok: false, message: 'Password should not contain your name or email.' };
  }

  const classCount = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length;

  if (classCount < 3) {
    return { ok: false, message: PASSWORD_POLICY_DESCRIPTION };
  }

  return { ok: true, message: 'Password meets the security policy.' };
};
