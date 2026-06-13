import type { Device } from '../types';
import type { DeviceModelTemplate, ManufacturedDevice, SiteTenant } from './store';

export const normalizeDeviceIdentity = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export const generateClaimCode = () => (
  `CLM-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
);

export const normalizeClaimCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isClaimCodeValid = (expected: string | undefined, provided: string) => (
  Boolean(expected && normalizeClaimCode(expected) === normalizeClaimCode(provided))
);

export const findManufacturedDeviceByIdentity = (manufacturedDevices: ManufacturedDevice[], identity: string) => {
  const normalized = normalizeDeviceIdentity(identity);
  if (!normalized) return null;
  return manufacturedDevices.find((item) => (
    normalizeDeviceIdentity(item.serialNumber || '') === normalized
    || normalizeDeviceIdentity(item.mac || '') === normalized
    || normalizeDeviceIdentity(item.imei || '') === normalized
  )) || null;
};

export const renderProvisioningTemplate = (template: string | undefined, manufacturedDevice: ManufacturedDevice) => {
  const identity = manufacturedDevice.serialNumber || manufacturedDevice.imei || manufacturedDevice.mac || manufacturedDevice.id;
  const replacements: Record<string, string> = {
    identity,
    serial: manufacturedDevice.serialNumber || identity,
    serialNumber: manufacturedDevice.serialNumber || identity,
    mac: manufacturedDevice.mac || identity,
    imei: manufacturedDevice.imei || identity,
    batch: manufacturedDevice.batchNo || '',
    batchNo: manufacturedDevice.batchNo || '',
    modelId: manufacturedDevice.modelId || '',
  };

  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => replacements[key] ?? '');
};

export const buildProvisionedDevice = (
  manufacturedDevice: ManufacturedDevice,
  model: DeviceModelTemplate,
  site: SiteTenant | undefined,
): Device => {
  const identity = manufacturedDevice.serialNumber || manufacturedDevice.imei || manufacturedDevice.mac || manufacturedDevice.id;
  const platformDeviceId = manufacturedDevice.claimedDeviceId || `DEV-${identity.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase() || Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const siteTags = site?.tags || [];
  const defaultTags = model.defaultTags || [];
  const tags = Array.from(new Set([...siteTags, ...defaultTags, model.modelNo, manufacturedDevice.batchNo].filter(Boolean) as string[]));

  return {
    id: platformDeviceId,
    name: `${model.name} ${identity}`,
    type: model.deviceType,
    siteId: site?.id || manufacturedDevice.siteId || 'factory-a',
    tenantId: site?.tenantId || manufacturedDevice.tenantId || 'default-tenant',
    tags: tags.length ? tags : ['factory-a'],
    icon: model.icon,
    scadaIcon: model.scadaIcon,
    config: {
      externalDeviceId: identity,
      dataSource: model.dataSource,
      protocol: model.protocol || (model.dataSource === 'mqtt' ? 'MQTT' : model.dataSource === 'api' ? 'HTTP Push' : 'Manual / Mock'),
      mqttTopic: renderProvisioningTemplate(model.mqttTopicTemplate || 'devices/{identity}/telemetry', manufacturedDevice),
      commandTopic: renderProvisioningTemplate(model.mqttCommandTopicTemplate || 'devices/{identity}/command', manufacturedDevice),
      mqttCommandTopic: renderProvisioningTemplate(model.mqttCommandTopicTemplate || 'devices/{identity}/command', manufacturedDevice),
      apiPath: renderProvisioningTemplate(model.apiPathTemplate || '/api/telemetry', manufacturedDevice),
      metricMappings: model.metricMappings || [],
      metricMapping: Object.fromEntries((model.metricMappings || []).map((mapping) => [mapping.rawKey, mapping.standardKey])),
      controlDefinitions: model.controlDefinitions || [],
      scadaOfflineDetectionEnabled: Boolean(model.offlineDetectionEnabled),
      scadaOfflineTimeoutSeconds: model.offlineTimeoutSeconds || 120,
    },
    status: 'offline',
    lastSeen: new Date().toISOString(),
    firmwareVersion: manufacturedDevice.firmwareVersion || model.firmwareVersion || 'v1.0.0',
    metrics: {},
  };
};
