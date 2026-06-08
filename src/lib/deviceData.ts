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

const TELEMETRY_METADATA_KEYS = new Set([
  'id',
  'device_id',
  'deviceId',
  'device_type',
  'type',
  'site_id',
  'siteId',
  'tenant_id',
  'tenantId',
  'tags',
  'metrics',
  'status',
  'timestamp',
  'lastSeen',
  'firmwareVersion',
  'name',
  'source',
  'received_at',
  'mqtt_topic',
  'topic',
]);

const extractTelemetryMetrics = (payload: DeviceTelemetryMessage) => ({
  ...toNumberMetrics(payload.metrics),
  ...toNumberMetrics(Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).filter(([key]) => !TELEMETRY_METADATA_KEYS.has(key))
  )),
});

export const normalizeDevice = (payload: DeviceTelemetryMessage): Device | null => {
  const id = payload.device_id || payload.deviceId || payload.id;
  const type = payload.device_type || payload.type;
  const siteId = payload.site_id || payload.siteId || payload.tenant_id || payload.tenantId;

  if (!id || !type) return null;

  return {
    id,
    name: payload.name || id,
    type,
    siteId,
    tenantId: payload.tenant_id || payload.tenantId,
    tags: payload.tags || (siteId ? [siteId] : []),
    metrics: extractTelemetryMetrics(payload),
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

  const existingDevice = devices.find((device) => device.id === id || device.config?.externalDeviceId === id);
  const nextDevice = normalizeDevice(payload);
  const incomingMetrics = extractTelemetryMetrics(payload);

  if (!existingDevice) {
    return nextDevice ? [...devices, nextDevice] : devices;
  }

  return devices.map((device) => (
    device.id === id || device.config?.externalDeviceId === id
      ? {
          ...device,
          ...(nextDevice || {}),
          name: payload.name || device.name,
          type: payload.device_type || payload.type || device.type,
          status: payload.status || device.status,
          lastSeen: payload.lastSeen || payload.timestamp || new Date().toISOString(),
          siteId: payload.site_id || payload.siteId || payload.tenant_id || payload.tenantId || device.siteId,
          tenantId: payload.tenant_id || payload.tenantId || device.tenantId,
          tags: payload.tags?.length ? payload.tags : device.tags,
          metrics: {
            ...device.metrics,
            ...incomingMetrics,
          },
          firmwareVersion: payload.firmwareVersion || device.firmwareVersion,
        }
      : device
  ));
};
