import type { Device } from '../types';

export const DEFAULT_DEVICE_OFFLINE_TIMEOUT_SECONDS = 120;

export type DeviceQualityState = 'online' | 'warning' | 'stale' | 'offline' | 'never_reported';

export type DeviceDataQuality = {
  state: DeviceQualityState;
  label: string;
  description: string;
  lastSeenTime: number;
  ageMs: number;
  timeoutSeconds: number;
  hasLiveData: boolean;
  isFresh: boolean;
  isOfflineByRule: boolean;
  isOfflineDetectionEnabled: boolean;
};

export const getDeviceOfflineTimeoutSeconds = (device?: Device | null) => {
  const configured = device?.config?.scadaOfflineDetectionEnabled
    ? Number(device.config.scadaOfflineTimeoutSeconds)
    : Number.NaN;
  return Math.max(5, Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DEVICE_OFFLINE_TIMEOUT_SECONDS);
};

export const isDeviceOfflineDetectionEnabled = (device?: Device | null) => (
  Boolean(device?.config?.scadaOfflineDetectionEnabled)
);

export const getDeviceLastSeenTime = (device?: Device | null) => {
  if (!device?.lastSeen) return Number.NaN;
  const lastSeen = new Date(device.lastSeen).getTime();
  return Number.isFinite(lastSeen) ? lastSeen : Number.NaN;
};

export const isDeviceTelemetryFresh = (device?: Device | null, now = Date.now()) => {
  const lastSeen = getDeviceLastSeenTime(device);
  if (!Number.isFinite(lastSeen)) return false;
  return now - lastSeen <= getDeviceOfflineTimeoutSeconds(device) * 1000;
};

export const getRuntimeDeviceStatus = (device: Device, now = Date.now()): Device['status'] => {
  if (device.status === 'offline') return 'offline';
  if (isDeviceOfflineDetectionEnabled(device) && !isDeviceTelemetryFresh(device, now)) return 'offline';
  return device.status;
};

export const getDeviceDataQuality = (device?: Device | null, now = Date.now()): DeviceDataQuality => {
  const lastSeenTime = getDeviceLastSeenTime(device);
  const timeoutSeconds = getDeviceOfflineTimeoutSeconds(device);
  const hasLastSeen = Number.isFinite(lastSeenTime);
  const ageMs = hasLastSeen ? Math.max(0, now - lastSeenTime) : Number.POSITIVE_INFINITY;
  const isFresh = hasLastSeen && ageMs <= timeoutSeconds * 1000;
  const isOfflineDetectionEnabled = isDeviceOfflineDetectionEnabled(device);
  const isOfflineByRule = Boolean(device && device.status !== 'offline' && isOfflineDetectionEnabled && !isFresh);
  const hasLiveData = Boolean(device && isFresh && device.status !== 'offline' && Object.keys(device.metrics || {}).length > 0);

  if (!device || !hasLastSeen) {
    return {
      state: 'never_reported',
      label: 'Never Reported',
      description: 'No telemetry has been received for this device.',
      lastSeenTime,
      ageMs,
      timeoutSeconds,
      hasLiveData: false,
      isFresh: false,
      isOfflineByRule: false,
      isOfflineDetectionEnabled,
    };
  }

  if (device.status === 'offline' || isOfflineByRule) {
    return {
      state: 'offline',
      label: 'Offline',
      description: isOfflineByRule
        ? `No telemetry within ${timeoutSeconds}s. Offline detection marked this device offline.`
        : 'The latest device status is offline.',
      lastSeenTime,
      ageMs,
      timeoutSeconds,
      hasLiveData: false,
      isFresh,
      isOfflineByRule,
      isOfflineDetectionEnabled,
    };
  }

  if (!isFresh) {
    return {
      state: 'stale',
      label: 'Stale',
      description: `Latest telemetry is older than ${timeoutSeconds}s, so live widgets should show No Live Data.`,
      lastSeenTime,
      ageMs,
      timeoutSeconds,
      hasLiveData: false,
      isFresh: false,
      isOfflineByRule: false,
      isOfflineDetectionEnabled,
    };
  }

  if (device.status === 'warning') {
    return {
      state: 'warning',
      label: 'Warning',
      description: 'Telemetry is fresh, but the device reports a warning status.',
      lastSeenTime,
      ageMs,
      timeoutSeconds,
      hasLiveData,
      isFresh: true,
      isOfflineByRule: false,
      isOfflineDetectionEnabled,
    };
  }

  return {
    state: 'online',
    label: 'Live',
    description: 'Telemetry is fresh and available for realtime views.',
    lastSeenTime,
    ageMs,
    timeoutSeconds,
    hasLiveData,
    isFresh: true,
    isOfflineByRule: false,
    isOfflineDetectionEnabled,
  };
};

export const formatDeviceAge = (ageMs: number) => {
  if (!Number.isFinite(ageMs)) return 'never';
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export const getRuntimeDevice = (device: Device, now = Date.now()): Device => {
  const status = getRuntimeDeviceStatus(device, now);
  const quality = getDeviceDataQuality(device, now);
  return {
    ...device,
    status,
    metrics: quality.hasLiveData ? device.metrics : {},
  };
};

export const deriveRuntimeDevices = (devices: Device[], now = Date.now()) => (
  devices.map((device) => getRuntimeDevice(device, now))
);
