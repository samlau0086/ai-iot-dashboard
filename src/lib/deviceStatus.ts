import type { Device } from '../types';

export const DEFAULT_DEVICE_OFFLINE_TIMEOUT_SECONDS = 120;

export const getDeviceOfflineTimeoutSeconds = (device?: Device | null) => {
  const configured = device?.config?.scadaOfflineDetectionEnabled
    ? Number(device.config.scadaOfflineTimeoutSeconds)
    : Number.NaN;
  return Math.max(5, Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DEVICE_OFFLINE_TIMEOUT_SECONDS);
};

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
  return isDeviceTelemetryFresh(device, now) ? device.status : 'offline';
};

export const getRuntimeDevice = (device: Device, now = Date.now()): Device => {
  const status = getRuntimeDeviceStatus(device, now);
  return {
    ...device,
    status,
    metrics: status === 'offline' ? {} : device.metrics,
  };
};

export const deriveRuntimeDevices = (devices: Device[], now = Date.now()) => (
  devices.map((device) => getRuntimeDevice(device, now))
);
