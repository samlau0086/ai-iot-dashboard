import type { Device, DeviceTelemetryMessage } from '../types';

const toNumberMetrics = (metrics: Record<string, unknown> = {}) => {
  return Object.entries(metrics).reduce<Record<string, number>>((acc, [key, value]) => {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      acc[key] = numericValue;
    }

    return acc;
  }, {});
};

export const normalizeDevice = (payload: DeviceTelemetryMessage): Device | null => {
  const id = payload.device_id || payload.deviceId || payload.id;
  const type = payload.device_type || payload.type;

  if (!id || !type) return null;

  return {
    id,
    name: payload.name || id,
    type,
    tags: payload.tags || (payload.site_id ? [payload.site_id] : []),
    metrics: toNumberMetrics(payload.metrics),
    status: payload.status || 'online',
    lastSeen: payload.lastSeen || payload.timestamp || new Date().toISOString(),
    firmwareVersion: payload.firmwareVersion || 'unknown',
  };
};

export const normalizeDeviceList = (payload: unknown): Device[] => {
  const devicesPayload = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.devices)
      ? (payload as any).devices
      : [];

  return devicesPayload
    .map((item) => normalizeDevice(item as DeviceTelemetryMessage))
    .filter((device): device is Device => Boolean(device));
};

export const mergeTelemetryIntoDevices = (devices: Device[], payload: DeviceTelemetryMessage) => {
  const id = payload.device_id || payload.deviceId || payload.id;
  if (!id) return devices;

  const existingDevice = devices.find((device) => device.id === id);
  const nextDevice = normalizeDevice(payload);

  if (!existingDevice) {
    return nextDevice ? [...devices, nextDevice] : devices;
  }

  return devices.map((device) => (
    device.id === id
      ? {
          ...device,
          ...(nextDevice || {}),
          name: payload.name || device.name,
          type: payload.device_type || payload.type || device.type,
          status: payload.status || device.status,
          lastSeen: payload.lastSeen || payload.timestamp || new Date().toISOString(),
          tags: payload.tags?.length ? payload.tags : device.tags,
          metrics: {
            ...device.metrics,
            ...toNumberMetrics(payload.metrics),
          },
          firmwareVersion: payload.firmwareVersion || device.firmwareVersion,
        }
      : device
  ));
};
