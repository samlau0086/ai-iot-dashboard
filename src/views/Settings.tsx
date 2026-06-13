import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, CheckCircle2, Copy, Database, KeyRound, Package, Plus, Printer, QrCode, Send, Settings as SettingsIcon, Trash2, UserCheck, UserX, Users, Wifi, X } from 'lucide-react';
import { useAppStore, type DeviceModelTemplate, type ManufacturedDevice, type NotificationChannel, type SiteTenant } from '../lib/store';
import type { DeviceType } from '../types';
import { translations } from '../lib/i18n';
import { cn } from '../lib/utils';
import { confirmDelete } from '../lib/confirm';
import { notifySuccess } from '../lib/toast';
import { UnderDevelopmentBadge } from '../components/UnderDevelopmentBadge';
import { generateClaimCode, generateClaimToken } from '../lib/deviceProvisioning';
import { APP_PROFILE_OPTIONS, FEATURE_ACCESS_OPTIONS, getUserAppProfile, getUserFeatureAccess, type AppProfile, type FeatureNavKey } from '../lib/featureAccess';

const CHANNEL_TYPES: NotificationChannel['type'][] = ['email', 'webhook', 'bark', 'sms', 'telegram', 'slack'];
const USER_ROLES = ['Owner', 'Admin', 'Engineer', 'Operator', 'Viewer', 'Demo', 'Partner', 'Customer'];
const SITE_TYPES: SiteTenant['type'][] = ['factory', 'solar', 'cold_storage', 'pump_station', 'compressed_air', 'other'];
const PROVISION_DEVICE_TYPES: DeviceType[] = ['gateway', 'dtu', 'rtu', 'lora_gateway', 'plc', 'io_module', 'relay_module', 'energy_meter', 'temperature_sensor', 'pressure_sensor', 'flow_meter', 'pump_controller', 'valve_controller', 'air_compressor', 'vfd', 'solar_inverter', 'battery_bms', 'ups', 'sensor'];
const INGEST_TOKEN_SCOPE_OPTIONS = [
  { value: 'telemetry:write', label: 'Telemetry Write', description: 'Allow HTTP/MQTT gateway telemetry ingestion.' },
  { value: 'command:pending', label: 'Fetch Commands', description: 'Allow a device gateway to pull queued downstream commands.' },
  { value: 'command:ack', label: 'Ack Commands', description: 'Allow a device gateway to acknowledge command results.' },
];

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const splitCsv = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

type CsvPreviewRow = {
  lineNumber: number;
  row: Record<string, string>;
  action: 'create' | 'overwrite' | 'skip';
  errors: string[];
  item?: ManufacturedDevice;
};

type CsvPreview = {
  rows: CsvPreviewRow[];
  validItems: ManufacturedDevice[];
  createCount: number;
  overwriteCount: number;
  errorCount: number;
  skippedCount: number;
};

const manufacturedIdentityKey = (item: Pick<ManufacturedDevice, 'serialNumber' | 'mac' | 'imei'>) => (
  [item.serialNumber, item.mac, item.imei].filter(Boolean).join('|').toLowerCase()
);

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

const isValidMac = (value: string) => !value || /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value) || /^[0-9a-f]{12}$/i.test(value);
const isValidImei = (value: string) => !value || /^\d{14,17}$/.test(value);
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const DEFAULT_NOTIFICATION_CONFIG: Record<NotificationChannel['type'], Record<string, string>> = {
  email: { recipients: '', subjectPrefix: '[IoT Alert]' },
  webhook: { url: '', method: 'POST', secretHeader: '' },
  bark: { serverUrl: 'https://api.day.app', deviceKey: '' },
  sms: { provider: 'custom', phoneNumber: '', templateId: '' },
  telegram: { botToken: '', chatId: '' },
  slack: { webhookUrl: '', channel: '', username: 'AI IoT Dashboard' },
};

const NOTIFICATION_FIELDS: Record<NotificationChannel['type'], { key: string; label: string; placeholder: string; secret?: boolean }[]> = {
  email: [
    { key: 'recipients', label: 'Recipients', placeholder: 'ops@example.com, manager@example.com' },
    { key: 'subjectPrefix', label: 'Subject Prefix', placeholder: '[IoT Alert]' },
  ],
  webhook: [
    { key: 'url', label: 'Webhook URL', placeholder: 'https://example.com/iot-alerts' },
    { key: 'method', label: 'Method', placeholder: 'POST' },
    { key: 'secretHeader', label: 'Secret Header', placeholder: 'x-alert-secret: ********', secret: true },
  ],
  bark: [
    { key: 'serverUrl', label: 'Bark Server', placeholder: 'https://api.day.app' },
    { key: 'deviceKey', label: 'Device Key', placeholder: 'Bark device key', secret: true },
  ],
  sms: [
    { key: 'provider', label: 'Provider', placeholder: 'twilio / aliyun / custom' },
    { key: 'phoneNumber', label: 'Phone Number', placeholder: '+1 555 0100' },
    { key: 'templateId', label: 'Template ID', placeholder: 'Optional provider template' },
  ],
  telegram: [
    { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC...', secret: true },
    { key: 'chatId', label: 'Chat ID', placeholder: '-1001234567890' },
  ],
  slack: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...' },
    { key: 'channel', label: 'Channel', placeholder: '#factory-alerts' },
    { key: 'username', label: 'Bot Name', placeholder: 'AI IoT Dashboard' },
  ],
};

const notificationTargetFromConfig = (type: NotificationChannel['type'], config: Record<string, string>) => {
  switch (type) {
    case 'email': return config.recipients || '';
    case 'webhook': return config.url || '';
    case 'bark': return config.deviceKey || '';
    case 'sms': return config.phoneNumber || '';
    case 'telegram': return config.chatId || '';
    case 'slack': return config.webhookUrl || config.channel || '';
    default: return '';
  }
};

const notificationConfigFromChannel = (channel: NotificationChannel) => {
  const config = { ...DEFAULT_NOTIFICATION_CONFIG[channel.type], ...(channel.config || {}) };
  if (!channel.config && channel.target) {
    switch (channel.type) {
      case 'email':
        config.recipients = channel.target;
        break;
      case 'webhook':
        config.url = channel.target;
        break;
      case 'bark':
        config.deviceKey = channel.target;
        break;
      case 'sms':
        config.phoneNumber = channel.target;
        break;
      case 'telegram':
        config.chatId = channel.target;
        break;
      case 'slack':
        config.webhookUrl = channel.target;
        break;
    }
  }

  return config;
};

type HttpPushChannel = {
  id: string;
  name: string;
  enabled: boolean;
  token: string;
  siteIds?: string[];
  deviceIds?: string[];
};

type MqttChannel = {
  id: string;
  name: string;
  enabled: boolean;
  brokerUrl: string;
  username: string;
  password?: string;
  topics: string[] | string;
  siteIds?: string[];
  deviceIds?: string[];
};

type MqttStatus = {
  state: string;
  message: string;
  connectedAt?: string | null;
  lastMessageAt?: string | null;
  lastTopic?: string | null;
  receivedCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
};

type IngestToken = {
  id: string;
  name: string;
  token: string;
  ownerUserId: string;
  ownerName: string;
  scopes?: string[];
  siteIds?: string[];
  deviceIds?: string[];
  createdAt: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  lastUsedSource?: string | null;
};

export function Settings() {
  const {
    language,
    notificationChannels,
    addNotificationChannel,
    updateNotificationChannel,
    deleteNotificationChannel,
    testNotificationChannel,
    users,
    addUser,
    updateUser,
    deleteUser,
    approveUser,
    rejectUser,
    currentUser,
    sites,
    addSite,
    updateSite,
    deleteSite,
    deviceModels,
    manufacturedDevices,
    provisioningAuditLogs,
    addDeviceModel,
    updateDeviceModel,
    deleteDeviceModel,
    addManufacturedDevice,
    updateManufacturedDevice,
    deleteManufacturedDevice,
    bulkImportManufacturedDevices,
    revokeManufacturedDeviceClaim,
    regenerateManufacturedDeviceClaimCode,
    addProvisioningAuditLog,
    whiteLabelConfig,
    updateWhiteLabelConfig,
    devices,
  } = useAppStore();
  const t = translations[language];
  const isDemoUser = currentUser?.role === 'Demo';
  const [activeTab, setActiveTab] = useState<'general' | 'sites' | 'data' | 'tokens' | 'provisioning' | 'notifications' | 'users'>('general');
  const [httpPushChannels, setHttpPushChannels] = useState<HttpPushChannel[]>([]);
  const [mqttChannels, setMqttChannels] = useState<MqttChannel[]>([]);
  const [mqttStatuses, setMqttStatuses] = useState<Record<string, MqttStatus>>({});
  const [mqttObservedTopics, setMqttObservedTopics] = useState<Record<string, string[]>>({});
  const [mqttTopicDrafts, setMqttTopicDrafts] = useState<Record<string, string>>({});
  const [dataSourceMessage, setDataSourceMessage] = useState('');
  const [ingestTokens, setIngestTokens] = useState<IngestToken[]>([]);
  const [tokenDraftName, setTokenDraftName] = useState('Device Gateway Token');
  const [tokenDraftScopes, setTokenDraftScopes] = useState<string[]>(['telemetry:write']);
  const [tokenDraftSiteIds, setTokenDraftSiteIds] = useState('');
  const [tokenDraftDeviceIds, setTokenDraftDeviceIds] = useState('');
  const [tokenMessage, setTokenMessage] = useState('');
  const [testingNotificationIds, setTestingNotificationIds] = useState<string[]>([]);
  const [channelDraft, setChannelDraft] = useState({
    type: 'email' as NotificationChannel['type'],
    name: '',
    config: { ...DEFAULT_NOTIFICATION_CONFIG.email },
  });
  const [userDraft, setUserDraft] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Operator',
    appProfile: 'operations' as AppProfile,
    siteId: 'factory-a',
  });
  const [siteDraft, setSiteDraft] = useState({
    id: '',
    name: '',
    tenantId: 'default-tenant',
    tenantName: 'Default Tenant',
    type: 'factory' as SiteTenant['type'],
    tags: 'factory-a',
    location: '',
    timezone: 'Asia/Shanghai',
  });
  const [modelDraft, setModelDraft] = useState({
    name: '4G IoT Gateway',
    modelNo: 'IOT-GW-4G-01',
    deviceType: 'gateway' as DeviceType,
    dataSource: 'mqtt' as 'api' | 'mqtt' | 'manual',
    protocol: 'MQTT',
    mqttTopicTemplate: 'devices/{identity}/telemetry',
    mqttCommandTopicTemplate: 'devices/{identity}/command',
    apiPathTemplate: '/api/telemetry',
    defaultTags: 'gateway,4g',
    firmwareVersion: 'v1.0.0',
    metricMappingsJson: '[]',
    controlDefinitionsJson: '[]',
  });
  const [manufacturedDraft, setManufacturedDraft] = useState({
    modelId: '',
    serialNumber: '',
    mac: '',
    imei: '',
    batchNo: '',
    firmwareVersion: '',
    status: 'in_stock' as ManufacturedDevice['status'],
    note: '',
  });
  const [manufacturedCsv, setManufacturedCsv] = useState('serialNumber,mac,imei,modelNo,batchNo,firmwareVersion,claimCode,claimToken,status,note\nSN202606130001,AA:BB:CC:11:22:33,860000000000001,IOT-GW-4G-01,BATCH-202606,1.0.3,,,in_stock,');
  const [manufacturedCsvPreview, setManufacturedCsvPreview] = useState<CsvPreview | null>(null);
  const [manufacturedBatchFilter, setManufacturedBatchFilter] = useState('all');
  const [claimLabelModal, setClaimLabelModal] = useState<{ item: ManufacturedDevice; claimLink: string } | null>(null);
  const [provisioningMessage, setProvisioningMessage] = useState('');
  const [generalDraft, setGeneralDraft] = useState({
    productName: whiteLabelConfig.productName,
    companyName: whiteLabelConfig.companyName,
    supportEmail: whiteLabelConfig.supportEmail || '',
    customDomain: whiteLabelConfig.customDomain || '',
    portalTitle: whiteLabelConfig.portalTitle || '',
  });

  const tabs = [
    { id: 'general', name: t.settings.tabs.general, icon: SettingsIcon },
    { id: 'sites', name: 'Sites', icon: Building2 },
    { id: 'data', name: 'Data Sources', icon: Database },
    { id: 'tokens', name: 'Ingest Tokens', icon: KeyRound },
    { id: 'provisioning', name: 'Provisioning', icon: Package },
    { id: 'notifications', name: t.settings.tabs.notifications, icon: Bell },
    { id: 'users', name: t.settings.tabs.users, icon: Users },
  ];

  const mqttChannelIds = mqttChannels.map((channel) => channel.id).join('|');
  const normalizeTopics = (topics: MqttChannel['topics']) => Array.isArray(topics)
    ? topics.map((topic) => topic.trim()).filter(Boolean)
    : topics.split(',').map((topic) => topic.trim()).filter(Boolean);

  useEffect(() => {
    const loadDataSources = async () => {
      try {
        const response = await fetch('/api/data-sources');
        if (!response.ok) return;
        const payload = await response.json();
        setHttpPushChannels(Array.isArray(payload.httpPushChannels) ? payload.httpPushChannels : []);
        setMqttChannels(Array.isArray(payload.mqttChannels)
          ? payload.mqttChannels.map((channel: MqttChannel) => ({
              ...channel,
              password: '',
              topics: normalizeTopics(channel.topics || []),
            }))
          : []);
        setMqttStatuses(payload.mqttStatuses || {});
        setMqttObservedTopics(payload.mqttObservedTopics || {});
      } catch (error) {
        setDataSourceMessage('Failed to load device data source config.');
      }
    };

    const loadIngestTokens = async () => {
      try {
        const response = await fetch('/api/ingest-tokens');
        if (!response.ok) return;
        const payload = await response.json();
        setIngestTokens(Array.isArray(payload.tokens) ? payload.tokens : []);
      } catch (error) {
        setTokenMessage('Failed to load ingest tokens.');
      }
    };

    loadDataSources();
    loadIngestTokens();
  }, []);

  useEffect(() => {
    setGeneralDraft({
      productName: whiteLabelConfig.productName,
      companyName: whiteLabelConfig.companyName,
      supportEmail: whiteLabelConfig.supportEmail || '',
      customDomain: whiteLabelConfig.customDomain || '',
      portalTitle: whiteLabelConfig.portalTitle || '',
    });
  }, [whiteLabelConfig]);

  useEffect(() => {
    if (activeTab !== 'data' || mqttChannelIds.length === 0) return;

    let cancelled = false;
    const refreshMqttStatuses = async () => {
      try {
        const response = await fetch('/api/data-sources');
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!cancelled) {
          setMqttStatuses(payload.mqttStatuses || {});
          setMqttObservedTopics(payload.mqttObservedTopics || {});
        }
      } catch {
        // Keep the last visible status if the backend is briefly unavailable.
      }
    };

    refreshMqttStatuses();
    const intervalId = window.setInterval(refreshMqttStatuses, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTab, mqttChannelIds]);

  const handleAddChannel = () => {
    const target = notificationTargetFromConfig(channelDraft.type, channelDraft.config);
    if (!target.trim()) return;

    addNotificationChannel({
      id: newId('channel'),
      type: channelDraft.type,
      name: channelDraft.name.trim() || `${channelDraft.type.toUpperCase()} Channel`,
      target: target.trim(),
      config: channelDraft.config,
      enabled: true,
    });
    setChannelDraft({ type: 'email', name: '', config: { ...DEFAULT_NOTIFICATION_CONFIG.email } });
  };

  const handleTestNotificationChannel = async (channelId: string) => {
    setTestingNotificationIds((current) => [...new Set([...current, channelId])]);
    try {
      await testNotificationChannel(channelId);
    } finally {
      setTestingNotificationIds((current) => current.filter((id) => id !== channelId));
    }
  };

  const handleAddUser = () => {
    if (!userDraft.name.trim() || !userDraft.email.trim() || !userDraft.password.trim()) return;

    addUser({
      id: newId('user'),
      name: userDraft.name.trim(),
      email: userDraft.email.trim().toLowerCase(),
      password: userDraft.password,
      role: userDraft.role,
      appProfile: userDraft.appProfile,
      siteId: userDraft.siteId.trim() || sites[0]?.id || 'factory-a',
      status: 'approved',
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
    });
    setUserDraft({ name: '', email: '', password: '', role: 'Operator', appProfile: 'operations', siteId: sites[0]?.id || 'factory-a' });
  };

  const handleUserFeatureAccessChange = (userId: string, key: FeatureNavKey, enabled: boolean) => {
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    updateUser(userId, {
      featureAccess: {
        ...(user.featureAccess || {}),
        [key]: enabled,
      },
    });
  };

  const handleResetUserFeatureAccess = (userId: string) => {
    updateUser(userId, { featureAccess: undefined });
  };

  const handleUserControlAccessChange = (userId: string, patch: NonNullable<typeof users[number]['controlAccess']>) => {
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    updateUser(userId, {
      controlAccess: {
        ...(user.controlAccess || {}),
        ...patch,
      },
    });
  };

  const handleResetUserControlAccess = (userId: string) => {
    updateUser(userId, { controlAccess: undefined });
  };

  const handleUserDataAccessChange = (userId: string, patch: NonNullable<typeof users[number]['dataAccess']>) => {
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    updateUser(userId, {
      dataAccess: {
        ...(user.dataAccess || {}),
        ...patch,
      },
    });
  };

  const handleResetUserDataAccess = (userId: string) => {
    updateUser(userId, { dataAccess: undefined });
  };

  const handleAddSite = () => {
    const id = siteDraft.id.trim() || siteDraft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id || !siteDraft.name.trim()) return;

    addSite({
      id,
      name: siteDraft.name.trim(),
      tenantId: siteDraft.tenantId.trim() || 'default-tenant',
      tenantName: siteDraft.tenantName.trim() || siteDraft.tenantId.trim() || 'Default Tenant',
      type: siteDraft.type,
      tags: siteDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      location: siteDraft.location.trim(),
      timezone: siteDraft.timezone.trim() || 'Asia/Shanghai',
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    setSiteDraft({
      id: '',
      name: '',
      tenantId: 'default-tenant',
      tenantName: 'Default Tenant',
      type: 'factory',
      tags: '',
      location: '',
      timezone: 'Asia/Shanghai',
    });
  };

  const handleSaveGeneral = () => {
    updateWhiteLabelConfig({
      productName: generalDraft.productName.trim() || 'AI IoT Dashboard',
      companyName: generalDraft.companyName.trim() || 'IoT Edge Solutions',
      supportEmail: generalDraft.supportEmail.trim(),
      customDomain: generalDraft.customDomain.trim(),
      portalTitle: generalDraft.portalTitle.trim() || 'Industrial Monitoring Platform',
    });
    notifySuccess('General settings saved successfully.');
  };

  const parseJsonArray = (value: string, label: string) => {
    try {
      const parsed = JSON.parse(value || '[]');
      if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
      return parsed;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : `${label} JSON is invalid.`);
    }
  };

  const buildManufacturedCsvPreview = (): CsvPreview => {
    const lines = manufacturedCsv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      return {
        rows: [{
          lineNumber: 1,
          row: {},
          action: 'skip',
          errors: ['CSV requires a header row and at least one device row.'],
        }],
        validItems: [],
        createCount: 0,
        overwriteCount: 0,
        errorCount: 1,
        skippedCount: 1,
      };
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.trim());
    const modelByNo = new Map(deviceModels.map((model) => [model.modelNo.toLowerCase(), model.id]));
    const existingKeys = new Set(manufacturedDevices.map(manufacturedIdentityKey));
    const seenKeys = new Set<string>();
    const rows = lines.slice(1).map((line, index): CsvPreviewRow => {
      const cells = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ''])) as Record<string, string>;
      const serialNumber = row.serialNumber || row.serial || row.sn || '';
      const mac = row.mac || '';
      const imei = row.imei || '';
      const modelId = row.modelId || modelByNo.get((row.modelNo || '').toLowerCase()) || manufacturedDraft.modelId;
      const status = (row.status || 'in_stock') as ManufacturedDevice['status'];
      const errors: string[] = [];

      if (!serialNumber) errors.push('serialNumber is required.');
      if (!modelId) errors.push('modelNo/modelId was not found.');
      if (mac && !isValidMac(mac)) errors.push('MAC format is invalid. Use AA:BB:CC:11:22:33 or AABBCC112233.');
      if (imei && !isValidImei(imei)) errors.push('IMEI format is invalid. Use 14-17 digits.');
      if (!['in_stock', 'shipped', 'claimed', 'disabled'].includes(status)) errors.push('status must be in_stock, shipped, claimed, or disabled.');

      const item: ManufacturedDevice = {
        id: newId('mfg'),
        modelId,
        serialNumber,
        mac,
        imei,
        claimCode: row.claimCode || generateClaimCode(),
        claimToken: row.claimToken || '',
        batchNo: row.batchNo || row.batch || '',
        firmwareVersion: row.firmwareVersion || row.firmware || '',
        status,
        note: row.note || '',
        createdAt: new Date().toISOString(),
      };
      const identityKey = manufacturedIdentityKey(item);
      if (identityKey && seenKeys.has(identityKey)) errors.push('Duplicate identity in this CSV.');
      if (identityKey) seenKeys.add(identityKey);

      const action = errors.length > 0 ? 'skip' : existingKeys.has(identityKey) ? 'overwrite' : 'create';
      return {
        lineNumber: index + 2,
        row,
        action,
        errors,
        item: errors.length > 0 ? undefined : item,
      };
    });

    const validItems = rows.map((row) => row.item).filter(Boolean) as ManufacturedDevice[];
    return {
      rows,
      validItems,
      createCount: rows.filter((row) => row.action === 'create').length,
      overwriteCount: rows.filter((row) => row.action === 'overwrite').length,
      errorCount: rows.filter((row) => row.errors.length > 0).length,
      skippedCount: rows.filter((row) => row.action === 'skip').length,
    };
  };

  const handlePreviewManufacturedCsv = () => {
    const preview = buildManufacturedCsvPreview();
    setManufacturedCsvPreview(preview);
    setProvisioningMessage(`CSV preview: ${preview.createCount} new, ${preview.overwriteCount} overwrite, ${preview.errorCount} error rows.`);
  };

  const handleDownloadManufacturedCsvTemplate = () => {
    const template = [
      'serialNumber,mac,imei,modelNo,batchNo,firmwareVersion,claimCode,claimToken,status,note',
      'SN202606130001,AA:BB:CC:11:22:33,860000000000001,IOT-GW-4G-01,BATCH-202606,1.0.3,,,in_stock,Installed at customer site A',
    ].join('\n');
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'manufactured-devices-template.csv';
    link.click();
    URL.revokeObjectURL(url);
    setProvisioningMessage('CSV template downloaded.');
  };

  const handleAddDeviceModel = () => {
    setProvisioningMessage('');
    if (!modelDraft.name.trim() || !modelDraft.modelNo.trim()) {
      setProvisioningMessage('Model name and model number are required.');
      return;
    }
    try {
      const model: DeviceModelTemplate = {
        id: newId('model'),
        name: modelDraft.name.trim(),
        modelNo: modelDraft.modelNo.trim(),
        deviceType: modelDraft.deviceType,
        dataSource: modelDraft.dataSource,
        protocol: modelDraft.protocol.trim() || (modelDraft.dataSource === 'mqtt' ? 'MQTT' : 'HTTP Push'),
        mqttTopicTemplate: modelDraft.mqttTopicTemplate.trim(),
        mqttCommandTopicTemplate: modelDraft.mqttCommandTopicTemplate.trim(),
        apiPathTemplate: modelDraft.apiPathTemplate.trim(),
        defaultTags: modelDraft.defaultTags.split(',').map((tag) => tag.trim()).filter(Boolean),
        firmwareVersion: modelDraft.firmwareVersion.trim(),
        metricMappings: parseJsonArray(modelDraft.metricMappingsJson, 'Metric mappings'),
        controlDefinitions: parseJsonArray(modelDraft.controlDefinitionsJson, 'Control definitions'),
        offlineDetectionEnabled: false,
        offlineTimeoutSeconds: 120,
        createdAt: new Date().toISOString(),
      };
      addDeviceModel(model);
      setManufacturedDraft((current) => ({ ...current, modelId: current.modelId || model.id }));
      setProvisioningMessage(`Device model ${model.modelNo} added.`);
    } catch (error) {
      setProvisioningMessage(error instanceof Error ? error.message : 'Failed to add device model.');
    }
  };

  const handleAddManufacturedDevice = () => {
    setProvisioningMessage('');
    if (!manufacturedDraft.modelId || !manufacturedDraft.serialNumber.trim()) {
      setProvisioningMessage('Model and Serial Number are required.');
      return;
    }
    addManufacturedDevice({
      id: newId('mfg'),
      modelId: manufacturedDraft.modelId,
      serialNumber: manufacturedDraft.serialNumber.trim(),
      mac: manufacturedDraft.mac.trim(),
      imei: manufacturedDraft.imei.trim(),
      claimCode: generateClaimCode(),
      claimToken: generateClaimToken(),
      batchNo: manufacturedDraft.batchNo.trim(),
      firmwareVersion: manufacturedDraft.firmwareVersion.trim(),
      status: manufacturedDraft.status,
      note: manufacturedDraft.note.trim(),
      createdAt: new Date().toISOString(),
    });
    setManufacturedDraft((current) => ({
      ...current,
      serialNumber: '',
      mac: '',
      imei: '',
      note: '',
    }));
    setProvisioningMessage('Manufactured device added.');
  };

  const handleImportManufacturedCsv = () => {
    setProvisioningMessage('');
    const preview = manufacturedCsvPreview || buildManufacturedCsvPreview();
    setManufacturedCsvPreview(preview);
    if (preview.validItems.length === 0) {
      setProvisioningMessage(`No valid rows imported. ${preview.errorCount} row(s) need fixes.`);
      return;
    }
    bulkImportManufacturedDevices(preview.validItems);
    setProvisioningMessage(`${preview.validItems.length} rows imported: ${preview.createCount} new, ${preview.overwriteCount} overwritten, ${preview.errorCount} skipped with errors.`);
  };

  const copyClaimCode = async (item: ManufacturedDevice) => {
    const claimCode = item.claimCode || '';
    if (!claimCode) {
      setProvisioningMessage('No claim code yet. Regenerate one first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(claimCode);
      setProvisioningMessage(`Claim code copied for ${item.serialNumber}.`);
    } catch {
      setProvisioningMessage('Copy failed. Select the claim code manually.');
    }
  };

  const buildClaimLink = (claimToken: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/claim/${claimToken}`;
  };

  const ensureClaimToken = (item: ManufacturedDevice) => {
    const claimToken = item.claimToken || generateClaimToken();
    if (!item.claimToken) {
      updateManufacturedDevice(item.id, { claimToken });
    }
    return {
      item: { ...item, claimToken },
      claimLink: buildClaimLink(claimToken),
    };
  };

  const copyClaimLink = async (item: ManufacturedDevice) => {
    const { claimLink } = ensureClaimToken(item);
    try {
      await navigator.clipboard.writeText(claimLink);
      setProvisioningMessage(`Claim link copied for ${item.serialNumber}.`);
    } catch {
      setProvisioningMessage(`Copy failed. Claim link: ${claimLink}`);
    }
  };

  const openClaimLabelModal = (item: ManufacturedDevice) => {
    setClaimLabelModal(ensureClaimToken(item));
  };

  const printClaimLabel = () => {
    if (!claimLabelModal) return;
    const model = deviceModels.find((candidate) => candidate.id === claimLabelModal.item.modelId);
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(claimLabelModal.claimLink)}`;
    const popup = window.open('', '_blank', 'width=720,height=760');
    if (!popup) {
      setProvisioningMessage('Print window was blocked. Allow popups and try again.');
      return;
    }
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Device Claim Label</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; }
            .label { width: 420px; min-height: 560px; margin: 0 auto; padding: 24px; border: 2px solid #0f172a; border-radius: 12px; background: white; }
            .title { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
            .sub { color: #64748b; font-size: 12px; margin-bottom: 18px; }
            .qr { display: block; width: 260px; height: 260px; margin: 0 auto 18px; }
            .row { margin: 12px 0; }
            .key { display: block; color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
            .value { display: block; margin-top: 4px; font-size: 16px; font-weight: 700; word-break: break-word; }
            .mono { font-family: Consolas, monospace; }
            .link { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #475569; font-size: 10px; word-break: break-all; }
            @media print { body { background: white; padding: 0; } .label { border-color: #000; box-shadow: none; } }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="title">Device Claim Label</div>
            <div class="sub">Scan QR, enter Claim Code, bind device to your Site.</div>
            <img class="qr" src="${qrSrc}" alt="Claim QR" />
            <div class="row"><span class="key">Model</span><span class="value">${escapeHtml(model ? `${model.modelNo} / ${model.name}` : 'Unknown Model')}</span></div>
            <div class="row"><span class="key">Serial Number</span><span class="value mono">${escapeHtml(claimLabelModal.item.serialNumber || '-')}</span></div>
            <div class="row"><span class="key">Batch</span><span class="value mono">${escapeHtml(claimLabelModal.item.batchNo || '-')}</span></div>
            <div class="row"><span class="key">Claim Code</span><span class="value mono">${escapeHtml(claimLabelModal.item.claimCode || '-')}</span></div>
            <div class="link">${escapeHtml(claimLabelModal.claimLink)}</div>
          </div>
          <script>
            window.onload = () => {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    popup.document.close();
  };

  const handleRegenerateClaimCode = (item: ManufacturedDevice) => {
    regenerateManufacturedDeviceClaimCode(item.id, generateClaimCode(), currentUser);
    setProvisioningMessage(`Claim code regenerated for ${item.serialNumber}.`);
  };

  const handleRevokeClaim = async (item: ManufacturedDevice) => {
    if (!(await confirmDelete({ title: 'Revoke device claim', itemName: item.serialNumber, description: 'The inventory record will become available for a new claim. Existing platform device is not deleted.' }))) return;
    revokeManufacturedDeviceClaim(item.id, currentUser?.id);
    addProvisioningAuditLog({
      id: newId('provision-log'),
      manufacturedDeviceId: item.id,
      identity: item.serialNumber || item.mac || item.imei || item.id,
      action: 'claim_revoked',
      result: 'success',
      reason: `Claim revoked from ${item.claimedDeviceId || 'unknown device'}.`,
      platformDeviceId: item.claimedDeviceId,
      userId: currentUser?.id,
      userName: currentUser?.name,
      createdAt: new Date().toISOString(),
    });
    setProvisioningMessage(`Claim revoked for ${item.serialNumber}.`);
  };

  const manufacturedBatchOptions = useMemo(() => (
    Array.from(new Set(manufacturedDevices.map((item) => item.batchNo).filter(Boolean) as string[])).sort()
  ), [manufacturedDevices]);

  const visibleManufacturedDevices = useMemo(() => (
    manufacturedDevices.filter((item) => manufacturedBatchFilter === 'all' || (item.batchNo || '') === manufacturedBatchFilter)
  ), [manufacturedBatchFilter, manufacturedDevices]);

  const handleAddHttpPushChannel = () => {
    setHttpPushChannels((current) => [
      ...current,
      {
        id: newId('http'),
        name: `HTTP Push ${current.length + 1}`,
        enabled: true,
        token: Math.random().toString(36).slice(2, 12),
        siteIds: [],
        deviceIds: [],
      },
    ]);
  };

  const handleAddMqttChannel = () => {
    setMqttChannels((current) => [
      ...current,
      {
        id: newId('mqtt'),
        name: `MQTT Broker ${current.length + 1}`,
        enabled: false,
        brokerUrl: 'mqtt://broker.example.com:1883',
        username: '',
        password: '',
        topics: 'devices/+/telemetry',
        siteIds: [],
        deviceIds: [],
      },
    ]);
  };

  const updateMqttTopics = (channelId: string, topics: string[]) => {
    const uniqueTopics = Array.from(new Set(topics.map((topic) => topic.trim()).filter(Boolean)));
    setMqttChannels((current) => current.map((item) => (
      item.id === channelId ? { ...item, topics: uniqueTopics } : item
    )));
  };

  const addMqttTopic = (channelId: string, topic: string) => {
    const nextTopic = topic.trim();
    if (!nextTopic) return;
    const channel = mqttChannels.find((item) => item.id === channelId);
    if (!channel) return;
    updateMqttTopics(channelId, [...normalizeTopics(channel.topics), nextTopic]);
    setMqttTopicDrafts((current) => ({ ...current, [channelId]: '' }));
  };

  const removeMqttTopic = async (channelId: string, topic: string) => {
    const channel = mqttChannels.find((item) => item.id === channelId);
    if (!channel) return;
    if (!(await confirmDelete({ title: 'Remove MQTT topic', itemName: topic, description: `The topic will be removed from ${channel.name}.` }))) return;
    updateMqttTopics(channelId, normalizeTopics(channel.topics).filter((item) => item !== topic));
  };

  const handleSaveDataSources = async () => {
    setDataSourceMessage('');
    if (isDemoUser) {
      setDataSourceMessage('Demo account changes are local only and will not be saved to backend data sources.');
      return;
    }

    const channelsToSave = mqttChannels.map((channel) => ({
      ...channel,
      topics: normalizeTopics([
        ...normalizeTopics(channel.topics),
        mqttTopicDrafts[channel.id] || '',
      ]),
    }));

    const invalidMqtt = channelsToSave.find((channel) => {
      const topics = normalizeTopics(channel.topics);
      return channel.enabled && (!channel.brokerUrl.trim() || topics.length === 0);
    });
    if (invalidMqtt) {
      setDataSourceMessage(`${invalidMqtt.name} requires broker URL and at least one topic.`);
      return;
    }

    try {
      const response = await fetch('/api/data-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          httpPushChannels,
          mqttChannels: channelsToSave.map((channel) => ({
            ...channel,
            topics: normalizeTopics(channel.topics),
          })),
        }),
      });
      const payload = await response.json();
      if (response.ok) {
        setHttpPushChannels(Array.isArray(payload.httpPushChannels) ? payload.httpPushChannels : httpPushChannels);
        setMqttChannels(Array.isArray(payload.mqttChannels)
          ? payload.mqttChannels.map((channel: MqttChannel) => ({
              ...channel,
              password: '',
              topics: normalizeTopics(channel.topics || []),
            }))
          : mqttChannels);
        setMqttStatuses(payload.mqttStatuses || {});
        setMqttObservedTopics(payload.mqttObservedTopics || {});
        notifySuccess('Data sources saved successfully.');
      }
      setDataSourceMessage(response.ok ? 'Device data source channels saved.' : 'Failed to save device data source channels.');
    } catch (error) {
      setDataSourceMessage('Failed to save device data source channels.');
    }
  };

  const handleGenerateToken = async () => {
    setTokenMessage('');
    if (isDemoUser) {
      setTokenMessage('Demo account cannot generate backend ingest tokens.');
      return;
    }
    if (tokenDraftScopes.length === 0) {
      setTokenMessage('Select at least one token permission.');
      return;
    }

    try {
      const response = await fetch('/api/ingest-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tokenDraftName.trim() || 'Device Gateway Token',
          ownerUserId: currentUser?.id,
          ownerName: currentUser?.name,
          scopes: tokenDraftScopes,
          siteIds: splitCsv(tokenDraftSiteIds),
          deviceIds: splitCsv(tokenDraftDeviceIds),
        }),
      });
      const payload = await response.json();
      if (response.ok) {
        setIngestTokens(Array.isArray(payload.tokens) ? payload.tokens : []);
        setTokenDraftName('Device Gateway Token');
        setTokenDraftScopes(['telemetry:write']);
        setTokenDraftSiteIds('');
        setTokenDraftDeviceIds('');
        notifySuccess('Ingest token generated successfully.');
      }
      setTokenMessage(response.ok ? 'Token generated. Copy it into your gateway request header.' : 'Failed to generate token.');
    } catch (error) {
      setTokenMessage('Failed to generate token.');
    }
  };

  const toggleTokenDraftScope = (scope: string) => {
    setTokenDraftScopes((current) => (
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope]
    ));
  };

  const handleRevokeToken = async (tokenId: string) => {
    setTokenMessage('');
    const token = ingestTokens.find((item) => item.id === tokenId);
    if (!(await confirmDelete({ title: 'Revoke ingest token', itemName: token?.name || 'this token', description: 'Gateways using this token will no longer be able to send telemetry.' }))) return;
    if (isDemoUser) {
      setTokenMessage('Demo account cannot revoke backend ingest tokens.');
      return;
    }

    try {
      const response = await fetch(`/api/ingest-tokens/${encodeURIComponent(tokenId)}/revoke`, {
        method: 'POST',
      });
      const payload = await response.json();
      if (response.ok) {
        setIngestTokens(Array.isArray(payload.tokens) ? payload.tokens : []);
        notifySuccess('Ingest token revoked successfully.');
      }
      setTokenMessage(response.ok ? 'Token revoked.' : 'Failed to revoke token.');
    } catch (error) {
      setTokenMessage('Failed to revoke token.');
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setTokenMessage('Token copied.');
    } catch (error) {
      setTokenMessage('Copy failed. Select the token text and copy it manually.');
    }
  };

  const renderNotificationConfigFields = (
    type: NotificationChannel['type'],
    config: Record<string, string>,
    onChange: (key: string, value: string) => void
  ) => (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {NOTIFICATION_FIELDS[type].map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">{field.label}</label>
          <input
            type={field.secret ? 'password' : 'text'}
            value={config[field.key] || ''}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
          />
        </div>
      ))}
    </div>
  );

  const claimLabelModel = claimLabelModal
    ? deviceModels.find((candidate) => candidate.id === claimLabelModal.item.modelId)
    : null;
  const claimLabelQrSrc = claimLabelModal
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(claimLabelModal.claimLink)}`
    : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t.settings.title}
          <UnderDevelopmentBadge />
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t.settings.desc}</p>
      </div>

      <div className="bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
        <div className="border-b border-slate-200 dark:border-slate-800">
          <nav className="-mb-px flex border-b border-slate-200 dark:border-slate-800" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'general' | 'sites' | 'data' | 'tokens' | 'provisioning' | 'notifications' | 'users')}
                className={cn(
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-600 dark:text-orange-500'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-300',
                  'group inline-flex items-center border-b-2 py-4 px-6 text-sm font-medium transition-colors cursor-pointer outline-none'
                )}
              >
                <tab.icon
                  className={cn(
                    activeTab === tab.id ? 'text-orange-600 dark:text-orange-500' : 'text-slate-400 group-hover:text-slate-500 dark:group-hover:text-slate-300',
                    '-ml-0.5 mr-2 h-4 w-4'
                  )}
                  aria-hidden="true"
                />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-4 py-6 sm:p-8 min-h-[400px]">
          {activeTab === 'general' && (
            <div className="grid max-w-4xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium leading-6 text-slate-900 dark:text-slate-300">{t.settings.whiteLabel}</span>
                <input
                  type="text"
                  value={generalDraft.productName}
                  onChange={(event) => setGeneralDraft((current) => ({ ...current, productName: event.target.value }))}
                  className="mt-2 block w-full rounded-md border-0 bg-transparent px-3 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-500 dark:bg-slate-900/50 dark:text-white dark:ring-slate-700 sm:text-sm"
                  placeholder="AI IoT Dashboard"
                />
              </label>

              <label className="block text-sm">
                <span className="font-medium leading-6 text-slate-900 dark:text-slate-300">Company Name</span>
                <input
                  type="text"
                  value={generalDraft.companyName}
                  onChange={(event) => setGeneralDraft((current) => ({ ...current, companyName: event.target.value }))}
                  className="mt-2 block w-full rounded-md border-0 bg-transparent px-3 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-500 dark:bg-slate-900/50 dark:text-white dark:ring-slate-700 sm:text-sm"
                  placeholder="Customer company"
                />
              </label>

              <label className="block text-sm">
                <span className="font-medium leading-6 text-slate-900 dark:text-slate-300">Portal Subtitle</span>
                <input
                  type="text"
                  value={generalDraft.portalTitle}
                  onChange={(event) => setGeneralDraft((current) => ({ ...current, portalTitle: event.target.value }))}
                  className="mt-2 block w-full rounded-md border-0 bg-transparent px-3 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-500 dark:bg-slate-900/50 dark:text-white dark:ring-slate-700 sm:text-sm"
                  placeholder="Industrial Monitoring Platform"
                />
              </label>

              <label className="block text-sm">
                <span className="font-medium leading-6 text-slate-900 dark:text-slate-300">Support Email</span>
                <input
                  type="email"
                  value={generalDraft.supportEmail}
                  onChange={(event) => setGeneralDraft((current) => ({ ...current, supportEmail: event.target.value }))}
                  className="mt-2 block w-full rounded-md border-0 bg-transparent px-3 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-500 dark:bg-slate-900/50 dark:text-white dark:ring-slate-700 sm:text-sm"
                  placeholder="support@example.com"
                />
              </label>

              <label className="block text-sm sm:col-span-2">
                <span className="font-medium leading-6 text-slate-900 dark:text-slate-300">Custom Domain</span>
                <input
                  type="text"
                  value={generalDraft.customDomain}
                  onChange={(event) => setGeneralDraft((current) => ({ ...current, customDomain: event.target.value }))}
                  className="mt-2 block w-full rounded-md border-0 bg-transparent px-3 py-2 font-mono text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-500 dark:bg-slate-900/50 dark:text-white dark:ring-slate-700 sm:text-sm"
                  placeholder="dash.customer-domain.com"
                />
              </label>

              <div className="sm:col-span-2">
                <label htmlFor="timezone" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-300">
                  {t.settings.timezone}
                </label>
                <div className="mt-2">
                  <select
                    id="timezone"
                    name="timezone"
                    className="block w-full rounded-md border-0 py-2 px-3 text-slate-900 dark:text-slate-300 bg-transparent dark:bg-slate-900/50 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:max-w-xs sm:text-sm outline-none"
                    defaultValue="CST"
                  >
                    <option value="UTC">UTC</option>
                    <option value="EST">EST</option>
                    <option value="PST">PST</option>
                    <option value="CST">CST (China Standard Time)</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleSaveGeneral}
                  className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Save General Settings
                </button>
              </div>
            </div>
          )}

          {activeTab === 'sites' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold leading-7 text-slate-900 dark:text-white">
                    Site / Tenant Management
                    <UnderDevelopmentBadge />
                  </h2>
                  <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Model tenants and physical sites, then bind users and devices to a site for data isolation and dashboard scoping.
                  </p>
                </div>
                <div className="text-xs text-slate-500">Sites: {sites.length}</div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-[1fr_1fr_1fr_150px_1fr_1fr_auto]">
                <input
                  value={siteDraft.name}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Site name"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  value={siteDraft.id}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, id: event.target.value }))}
                  placeholder="site-id"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  value={siteDraft.tenantName}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, tenantName: event.target.value }))}
                  placeholder="Tenant name"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <select
                  value={siteDraft.type}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, type: event.target.value as SiteTenant['type'] }))}
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  {SITE_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <input
                  value={siteDraft.tags}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="tags, comma separated"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  value={siteDraft.location}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Location"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <button
                  type="button"
                  onClick={handleAddSite}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Site</th>
                      <th className="px-4 py-3 font-semibold">Tenant</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Tags</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {sites.map((site) => (
                      <tr key={site.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <input
                            value={site.name}
                            onChange={(event) => updateSite(site.id, { name: event.target.value })}
                            className="block w-44 rounded-md border-0 bg-transparent px-2 py-1 font-medium text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white"
                          />
                          <input
                            value={site.id}
                            onChange={(event) => updateSite(site.id, { id: event.target.value })}
                            className="mt-1 block w-44 rounded-md border-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={site.tenantName}
                            onChange={(event) => updateSite(site.id, { tenantName: event.target.value })}
                            className="block w-44 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-transparent focus:ring-orange-500 dark:text-slate-300"
                          />
                          <input
                            value={site.tenantId}
                            onChange={(event) => updateSite(site.id, { tenantId: event.target.value })}
                            className="mt-1 block w-44 rounded-md border-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={site.type}
                            onChange={(event) => updateSite(site.id, { type: event.target.value as SiteTenant['type'] })}
                            className="rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            {SITE_TYPES.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={site.tags.join(', ')}
                            onChange={(event) => updateSite(site.id, { tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
                            className="w-56 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={site.status}
                            onChange={(event) => updateSite(site.id, { status: event.target.value as SiteTenant['status'] })}
                            className="rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              if (await confirmDelete({ title: 'Delete site', itemName: site.name, description: 'Dashboards, SCADA scenes, and site assignments for this site may be removed or reassigned.' })) deleteSite(site.id);
                            }}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            title="Delete site"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">Device Data Sources</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  The same data source type can have multiple channels. Each channel writes into the same telemetry store and can be mapped to devices by External Device ID.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-orange-500" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Gateway HTTP Push Channels</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddHttpPushChannel}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add HTTP Channel
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Use separate endpoints for different gateways, factories, or customer sites. The token is embedded in the URL and can also be rotated here.
                </p>
                <div className="mt-4 space-y-3">
                  {httpPushChannels.map((channel) => (
                    <div key={channel.id} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Channel Name</label>
                          <input
                            value={channel.name}
                            onChange={(event) => setHttpPushChannels((current) => current.map((item) => item.id === channel.id ? { ...item, name: event.target.value } : item))}
                            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">URL Token</label>
                          <input
                            value={channel.token}
                            onChange={(event) => setHttpPushChannels((current) => current.map((item) => item.id === channel.id ? { ...item, token: event.target.value.trim() } : item))}
                            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <label className="inline-flex h-10 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={channel.enabled}
                              onChange={(event) => setHttpPushChannels((current) => current.map((item) => item.id === channel.id ? { ...item, enabled: event.target.checked } : item))}
                              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            Active
                          </label>
                          <button
                            type="button"
                            onClick={async () => {
                              if (await confirmDelete({ title: 'Delete HTTP channel', itemName: channel.name, description: 'Gateways using this HTTP endpoint will stop sending telemetry until reconfigured.' })) setHttpPushChannels((current) => current.filter((item) => item.id !== channel.id));
                            }}
                            className="mb-1 rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            title="Delete HTTP channel"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-slate-500">Gateway POST URL</label>
                      <code className="mt-1 block overflow-x-auto rounded bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {`${window.location.origin}/api/telemetry/${channel.id}/${channel.token || '<token>'}`}
                      </code>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Allowed Site IDs</label>
                          <input
                            value={(channel.siteIds || []).join(', ')}
                            onChange={(event) => setHttpPushChannels((current) => current.map((item) => item.id === channel.id ? { ...item, siteIds: splitCsv(event.target.value) } : item))}
                            placeholder="factory-a, pump-station"
                            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                          />
                          <p className="mt-1 text-xs text-slate-500">Empty means this HTTP channel can accept telemetry for every Site.</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Allowed Device IDs</label>
                          <input
                            value={(channel.deviceIds || []).join(', ')}
                            onChange={(event) => setHttpPushChannels((current) => current.map((item) => item.id === channel.id ? { ...item, deviceIds: splitCsv(event.target.value) } : item))}
                            placeholder="DEV-001, DEV-002"
                            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                          />
                          <p className="mt-1 text-xs text-slate-500">Empty means this HTTP channel can accept telemetry for every Device.</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {httpPushChannels.length === 0 && (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                      No HTTP Push channels yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-sky-500" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Backend MQTT Subscribers</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMqttChannel}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add MQTT Channel
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  The Dashboard backend can connect to multiple external MQTT Brokers at the same time. Each subscriber has its own topics and connection status.
                </p>
                <div className="mt-4 space-y-3">
                  {mqttChannels.map((channel) => {
                    const status = mqttStatuses[channel.id];
                    return (
                      <div key={channel.id} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr]">
                            <div>
                              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Channel Name</label>
                              <input
                                value={channel.name}
                                onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, name: event.target.value } : item))}
                                className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Broker URL</label>
                              <input
                                value={channel.brokerUrl}
                                onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, brokerUrl: event.target.value } : item))}
                                placeholder="mqtt://broker.example.com:1883"
                                className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-6">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={channel.enabled}
                                onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, enabled: event.target.checked } : item))}
                                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                              />
                              Active
                            </label>
                            <button
                              type="button"
                              onClick={async () => {
                                if (await confirmDelete({ title: 'Delete MQTT channel', itemName: channel.name, description: 'The backend subscriber will stop listening to this broker and its topics.' })) setMqttChannels((current) => current.filter((item) => item.id !== channel.id));
                              }}
                              className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                              title="Delete MQTT channel"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Username</label>
                            <input
                              value={channel.username}
                              onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, username: event.target.value } : item))}
                              placeholder="Optional"
                              className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Password</label>
                            <input
                              type="password"
                              value={channel.password || ''}
                              onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, password: event.target.value } : item))}
                              placeholder="Leave blank to keep saved password"
                              className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Subscribe Topics</label>
                            <div className="mt-1 flex min-h-[2.5rem] w-full flex-wrap items-center gap-2 rounded-md bg-white p-1.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                              {normalizeTopics(channel.topics).map((topic) => (
                                <span key={topic} className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  <span className="max-w-[13rem] truncate">{topic}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeMqttTopic(channel.id, topic)}
                                    className="text-slate-400 hover:text-red-500"
                                    title="Remove topic"
                                  >
                                    &times;
                                  </button>
                                </span>
                              ))}
                              <input
                                list={`mqtt-topic-options-${channel.id}`}
                                value={mqttTopicDrafts[channel.id] || ''}
                                onChange={(event) => setMqttTopicDrafts((current) => ({ ...current, [channel.id]: event.target.value }))}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ',') {
                                    event.preventDefault();
                                    addMqttTopic(channel.id, mqttTopicDrafts[channel.id] || '');
                                  } else if (event.key === 'Backspace' && !mqttTopicDrafts[channel.id]) {
                                    const topics = normalizeTopics(channel.topics);
                                    updateMqttTopics(channel.id, topics.slice(0, -1));
                                  }
                                }}
                                onBlur={() => addMqttTopic(channel.id, mqttTopicDrafts[channel.id] || '')}
                                placeholder="devices/+/telemetry"
                                className="min-w-[12rem] flex-1 border-0 bg-transparent p-0 font-mono text-sm text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:ring-0 dark:text-slate-200"
                              />
                              <datalist id={`mqtt-topic-options-${channel.id}`}>
                                {(mqttObservedTopics[channel.id] || [])
                                  .filter((topic) => !normalizeTopics(channel.topics).includes(topic))
                                  .map((topic) => (
                                    <option key={topic} value={topic} />
                                  ))}
                              </datalist>
                            </div>
                            {(mqttObservedTopics[channel.id] || []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(mqttObservedTopics[channel.id] || [])
                                  .filter((topic) => !normalizeTopics(channel.topics).includes(topic))
                                  .slice(0, 6)
                                  .map((topic) => (
                                    <button
                                      key={topic}
                                      type="button"
                                      onClick={() => addMqttTopic(channel.id, topic)}
                                      className="max-w-[12rem] truncate rounded border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-[10px] text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                                      title={topic}
                                    >
                                      {topic}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Allowed Site IDs</label>
                            <input
                              value={(channel.siteIds || []).join(', ')}
                              onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, siteIds: splitCsv(event.target.value) } : item))}
                              placeholder="factory-a, pump-station"
                              className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                            />
                            <p className="mt-1 text-xs text-slate-500">Empty means this MQTT subscriber can write telemetry for every Site.</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Allowed Device IDs</label>
                            <input
                              value={(channel.deviceIds || []).join(', ')}
                              onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, deviceIds: splitCsv(event.target.value) } : item))}
                              placeholder="DEV-001, DEV-002"
                              className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                            />
                            <p className="mt-1 text-xs text-slate-500">Empty means this MQTT subscriber can write telemetry for every Device.</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={cn(
                            'rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                            status?.state === 'connected' && 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300',
                            status && status.state !== 'connected' && status.state !== 'disabled' && 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
                            (!status || status.state === 'disabled') && 'bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                          )}>
                            {status ? `${status.state}: ${status.message}` : 'not saved yet'}
                          </span>
                          {status?.lastMessageAt && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">Last message: {new Date(status.lastMessageAt).toLocaleString()}</span>
                          )}
                          {status?.lastTopic && (
                            <span className="max-w-full truncate rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Topic: {status.lastTopic}
                            </span>
                          )}
                          {status && (status.receivedCount || status.acceptedCount || status.rejectedCount) ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Received {status.receivedCount || 0} / Accepted {status.acceptedCount || 0} / Rejected {status.rejectedCount || 0}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {mqttChannels.length === 0 && (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                      No MQTT subscribers yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveDataSources}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                >
                  <Send className="h-4 w-4" />
                  Save Data Sources
                </button>
                {dataSourceMessage && (
                  <span className="text-sm text-slate-600 dark:text-slate-300">{dataSourceMessage}</span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tokens' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">Ingest Token Management</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Generate user-owned tokens for gateways that POST telemetry to <span className="font-mono">/api/telemetry</span>. Revoked tokens stop working immediately.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-[1fr_auto]">
                <div className="space-y-4">
                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Token Name</label>
                  <input
                    value={tokenDraftName}
                    onChange={(event) => setTokenDraftName(event.target.value)}
                    placeholder="Factory A Gateway Token"
                    className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                  />
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Permissions</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                      {INGEST_TOKEN_SCOPE_OPTIONS.map((option) => (
                        <label key={option.value} className="flex cursor-pointer gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                          <input
                            type="checkbox"
                            checked={tokenDraftScopes.includes(option.value)}
                            onChange={() => toggleTokenDraftScope(option.value)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span>
                            <span className="block font-medium text-slate-800 dark:text-slate-100">{option.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{option.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Allowed Site IDs</label>
                      <input
                        value={tokenDraftSiteIds}
                        onChange={(event) => setTokenDraftSiteIds(event.target.value)}
                        placeholder="factory-a, pump-station"
                        className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                      />
                      <p className="mt-1 text-xs text-slate-500">Leave empty to allow every Site.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Allowed Device IDs</label>
                      <input
                        value={tokenDraftDeviceIds}
                        onChange={(event) => setTokenDraftDeviceIds(event.target.value)}
                        placeholder="DEV-001, DEV-002"
                        className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                      />
                      <p className="mt-1 text-xs text-slate-500">Leave empty to allow every Device.</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleGenerateToken}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                  >
                    <Plus className="h-4 w-4" />
                    Generate Token
                  </button>
                </div>
              </div>

              {tokenMessage && (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {tokenMessage}
                </div>
              )}

              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Token</th>
                      <th className="px-4 py-3 font-semibold">Owner</th>
                      <th className="px-4 py-3 font-semibold">Permissions</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Last Used</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {ingestTokens.map((token) => {
                      const revoked = Boolean(token.revokedAt);
                      return (
                        <tr key={token.id}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-900 dark:text-white">{token.name}</div>
                            <code className="mt-1 block max-w-md overflow-x-auto rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                              {token.token}
                            </code>
                            <div className="mt-1 text-xs text-slate-500">Created: {new Date(token.createdAt).toLocaleString()}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="text-slate-700 dark:text-slate-200">{token.ownerName}</div>
                            <div className="mt-1 font-mono text-xs text-slate-500">{token.ownerUserId}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex max-w-xs flex-wrap gap-1.5">
                              {(token.scopes?.length ? token.scopes : ['All scopes']).map((scope) => (
                                <span key={scope} className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">{scope}</span>
                              ))}
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              <div>Sites: {token.siteIds?.length ? token.siteIds.join(', ') : 'All'}</div>
                              <div>Devices: {token.deviceIds?.length ? token.deviceIds.join(', ') : 'All'}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className={cn(
                              'rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                              revoked
                                ? 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300'
                                : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                            )}>
                              {revoked ? 'Revoked' : 'Active'}
                            </span>
                            {token.revokedAt && (
                              <div className="mt-2 text-xs text-slate-500">{new Date(token.revokedAt).toLocaleString()}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                            {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : 'Never'}
                            {token.lastUsedSource && (
                              <div className="mt-1 font-mono text-xs text-slate-500">{token.lastUsedSource}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleCopyToken(token.token)}
                                disabled={revoked}
                                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevokeToken(token.id)}
                                disabled={revoked}
                                className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {ingestTokens.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                          No ingest tokens yet. Generate one for your device gateway before enabling token-protected telemetry.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {activeTab === 'provisioning' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold leading-7 text-slate-900 dark:text-white">
                    Device Provisioning
                  </h2>
                  <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Register product models and manufactured device identities so users can auto-configure devices by MAC, IMEI, or Serial Number.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  Models: {deviceModels.length} / Inventory: {manufacturedDevices.length}
                </div>
              </div>

              {provisioningMessage && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  {provisioningMessage}
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Device Models</h3>
                    <Package className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <input value={modelDraft.name} onChange={(event) => setModelDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Model name" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <input value={modelDraft.modelNo} onChange={(event) => setModelDraft((current) => ({ ...current, modelNo: event.target.value }))} placeholder="Model No" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <select value={modelDraft.deviceType} onChange={(event) => setModelDraft((current) => ({ ...current, deviceType: event.target.value as DeviceType }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                      {PROVISION_DEVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <select value={modelDraft.dataSource} onChange={(event) => setModelDraft((current) => ({ ...current, dataSource: event.target.value as 'api' | 'mqtt' | 'manual' }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                      <option value="mqtt">MQTT</option>
                      <option value="api">HTTP Push</option>
                      <option value="manual">Manual</option>
                    </select>
                    <input value={modelDraft.mqttTopicTemplate} onChange={(event) => setModelDraft((current) => ({ ...current, mqttTopicTemplate: event.target.value }))} placeholder="MQTT topic template" className="rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <input value={modelDraft.mqttCommandTopicTemplate} onChange={(event) => setModelDraft((current) => ({ ...current, mqttCommandTopicTemplate: event.target.value }))} placeholder="Command topic template" className="rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <input value={modelDraft.apiPathTemplate} onChange={(event) => setModelDraft((current) => ({ ...current, apiPathTemplate: event.target.value }))} placeholder="API path template" className="rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <input value={modelDraft.defaultTags} onChange={(event) => setModelDraft((current) => ({ ...current, defaultTags: event.target.value }))} placeholder="Default tags, comma separated" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <textarea value={modelDraft.metricMappingsJson} onChange={(event) => setModelDraft((current) => ({ ...current, metricMappingsJson: event.target.value }))} placeholder="Metric mappings JSON array" rows={4} className="lg:col-span-2 rounded-md border-0 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <textarea value={modelDraft.controlDefinitionsJson} onChange={(event) => setModelDraft((current) => ({ ...current, controlDefinitionsJson: event.target.value }))} placeholder="Control definitions JSON array" rows={4} className="lg:col-span-2 rounded-md border-0 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <button type="button" onClick={handleAddDeviceModel} className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 lg:col-span-2">
                      <Plus className="h-4 w-4" />
                      Add Model
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {deviceModels.map((model) => (
                      <div key={model.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                        <div className="grid flex-1 grid-cols-1 gap-2 lg:grid-cols-2">
                          <input value={model.name} onChange={(event) => updateDeviceModel(model.id, { name: event.target.value })} className="rounded border-0 bg-transparent px-2 py-1 font-semibold text-slate-900 ring-1 ring-slate-200 focus:ring-orange-500 dark:text-white dark:ring-slate-800" />
                          <input value={model.modelNo} onChange={(event) => updateDeviceModel(model.id, { modelNo: event.target.value })} className="rounded border-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-600 ring-1 ring-slate-200 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-800" />
                          <select value={model.dataSource} onChange={(event) => updateDeviceModel(model.id, { dataSource: event.target.value as 'api' | 'mqtt' | 'manual' })} className="rounded border-0 bg-transparent px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-800">
                            <option value="mqtt">MQTT</option>
                            <option value="api">HTTP Push</option>
                            <option value="manual">Manual</option>
                          </select>
                          <input value={model.mqttTopicTemplate || ''} onChange={(event) => updateDeviceModel(model.id, { mqttTopicTemplate: event.target.value })} className="rounded border-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-600 ring-1 ring-slate-200 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-800" />
                        </div>
                        <button type="button" onClick={async () => {
                          if (await confirmDelete({ title: 'Delete device model', itemName: model.name, description: 'Manufactured devices using this model will lose their model link.' })) deleteDeviceModel(model.id);
                        }} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Manufactured Devices</h3>
                    <Database className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <select value={manufacturedDraft.modelId} onChange={(event) => setManufacturedDraft((current) => ({ ...current, modelId: event.target.value }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                      <option value="">Select model</option>
                      {deviceModels.map((model) => <option key={model.id} value={model.id}>{model.modelNo} / {model.name}</option>)}
                    </select>
                    <input value={manufacturedDraft.serialNumber} onChange={(event) => setManufacturedDraft((current) => ({ ...current, serialNumber: event.target.value }))} placeholder="Serial Number" className="rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <input value={manufacturedDraft.mac} onChange={(event) => setManufacturedDraft((current) => ({ ...current, mac: event.target.value }))} placeholder="MAC" className="rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <input value={manufacturedDraft.imei} onChange={(event) => setManufacturedDraft((current) => ({ ...current, imei: event.target.value }))} placeholder="IMEI" className="rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <input value={manufacturedDraft.batchNo} onChange={(event) => setManufacturedDraft((current) => ({ ...current, batchNo: event.target.value }))} placeholder="Batch No" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <input value={manufacturedDraft.firmwareVersion} onChange={(event) => setManufacturedDraft((current) => ({ ...current, firmwareVersion: event.target.value }))} placeholder="Firmware" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                    <button type="button" onClick={handleAddManufacturedDevice} className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 lg:col-span-2">
                      <Plus className="h-4 w-4" />
                      Add Manufactured Device
                    </button>
                  </div>

                  <div className="mt-5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">CSV Import</label>
                    <textarea
                      value={manufacturedCsv}
                      onChange={(event) => {
                        setManufacturedCsv(event.target.value);
                        setManufacturedCsvPreview(null);
                      }}
                      rows={6}
                      className="mt-2 w-full rounded-md border-0 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={handleDownloadManufacturedCsvTemplate} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        Download Template
                      </button>
                      <button type="button" onClick={handlePreviewManufacturedCsv} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        Preview CSV
                      </button>
                      <button type="button" onClick={handleImportManufacturedCsv} className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500">
                        Import Valid Rows
                      </button>
                    </div>
                    {manufacturedCsvPreview && (
                      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{manufacturedCsvPreview.createCount} new</span>
                          <span className="rounded bg-blue-50 px-2 py-1 font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{manufacturedCsvPreview.overwriteCount} overwrite</span>
                          <span className="rounded bg-red-50 px-2 py-1 font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">{manufacturedCsvPreview.errorCount} error</span>
                        </div>
                        {manufacturedCsvPreview.rows.filter((row) => row.errors.length > 0).slice(0, 6).map((row) => (
                          <div key={row.lineNumber} className="mt-2 text-red-600 dark:text-red-300">
                            Line {row.lineNumber}: {row.errors.join(' ')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Manufactured Inventory</h3>
                    <p className="text-xs text-slate-500">Filter by production batch to inspect imported devices.</p>
                  </div>
                  <select value={manufacturedBatchFilter} onChange={(event) => setManufacturedBatchFilter(event.target.value)} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                    <option value="all">All batches ({manufacturedDevices.length})</option>
                    {manufacturedBatchOptions.map((batch) => (
                      <option key={batch} value={batch}>{batch} ({manufacturedDevices.filter((item) => item.batchNo === batch).length})</option>
                    ))}
                  </select>
                </div>
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Serial / MAC / IMEI</th>
                      <th className="px-4 py-3 font-semibold">Model</th>
                      <th className="px-4 py-3 font-semibold">Batch</th>
                      <th className="px-4 py-3 font-semibold">Claim Code</th>
                      <th className="px-4 py-3 font-semibold">Claim Link</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Claimed Device</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {visibleManufacturedDevices.map((item) => {
                      const model = deviceModels.find((candidate) => candidate.id === item.modelId);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-mono text-xs">
                            <div>{item.serialNumber}</div>
                            <div className="text-slate-500">{item.mac || '-'} / {item.imei || '-'}</div>
                          </td>
                          <td className="px-4 py-3">{model ? `${model.modelNo} / ${model.name}` : <span className="text-red-500">Missing model</span>}</td>
                          <td className="px-4 py-3">{item.batchNo || '-'}</td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <button type="button" onClick={() => item.claimCode ? copyClaimCode(item) : handleRegenerateClaimCode(item)} className="rounded bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                              {item.claimCode || 'Generate'}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <div className="flex gap-1">
                              <button type="button" onClick={() => copyClaimLink(item)} className="rounded bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                                {item.claimToken ? 'Copy Link' : 'Generate Link'}
                              </button>
                              <button type="button" onClick={() => openClaimLabelModal(item)} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                                <QrCode className="h-3.5 w-3.5" />
                                Label
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select value={item.status} onChange={(event) => updateManufacturedDevice(item.id, { status: event.target.value as ManufacturedDevice['status'] })} className="rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700">
                              <option value="in_stock">in_stock</option>
                              <option value="shipped">shipped</option>
                              <option value="claimed">claimed</option>
                              <option value="disabled">disabled</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <div>{item.claimedDeviceId || '-'}</div>
                            {item.claimedAt && <div className="text-slate-500">{new Date(item.claimedAt).toLocaleString()}</div>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button type="button" onClick={() => handleRegenerateClaimCode(item)} className="mr-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-orange-600 dark:hover:bg-slate-800">
                              Regen
                            </button>
                            {item.status === 'claimed' && (
                              <button type="button" onClick={() => handleRevokeClaim(item)} className="mr-1 rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                                Revoke
                              </button>
                            )}
                            <button type="button" onClick={async () => {
                              if (await confirmDelete({ title: 'Delete manufactured device', itemName: item.serialNumber, description: 'This inventory record will be removed. Existing platform devices are not deleted.' })) deleteManufacturedDevice(item.id);
                            }} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleManufacturedDevices.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                          {manufacturedDevices.length === 0 ? 'No manufactured devices registered yet.' : 'No manufactured devices match this batch filter.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Claim Audit Log</h3>
                  <p className="text-xs text-slate-500">Successful claims, failed attempts, revoke operations, and claim-code regeneration.</p>
                </div>
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Identity</th>
                      <th className="px-4 py-3 font-semibold">Result</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="px-4 py-3 font-semibold">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {provisioningAuditLogs.slice(0, 50).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                        <td className="px-4 py-3 font-mono text-xs">{log.identity}</td>
                        <td className="px-4 py-3">
                          <span className={cn('rounded px-2 py-1 text-xs font-semibold', log.result === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300')}>
                            {log.result}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-md truncate text-slate-600 dark:text-slate-300" title={log.reason}>{log.reason}</td>
                        <td className="px-4 py-3 text-slate-500">{log.userName || log.userId || '-'}</td>
                      </tr>
                    ))}
                    {provisioningAuditLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No claim audit logs yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">{t.settings.notifications}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Same channel type can be added multiple times, for example several emails, webhooks, or Bark endpoints.
                </p>
              </div>

              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[150px_1fr_auto]">
                  <select
                    value={channelDraft.type}
                    onChange={(event) => {
                      const type = event.target.value as NotificationChannel['type'];
                      setChannelDraft((current) => ({ ...current, type, config: { ...DEFAULT_NOTIFICATION_CONFIG[type] } }));
                    }}
                    className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                  >
                    {CHANNEL_TYPES.map((type) => (
                      <option key={type} value={type}>{type.toUpperCase()}</option>
                    ))}
                  </select>
                  <input
                    value={channelDraft.name}
                    onChange={(event) => setChannelDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Channel name"
                    className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleAddChannel}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
                {renderNotificationConfigFields(
                  channelDraft.type,
                  channelDraft.config,
                  (key, value) => setChannelDraft((current) => ({ ...current, config: { ...current.config, [key]: value } }))
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Channel</th>
                      <th className="px-4 py-3 font-semibold">Configuration</th>
                      <th className="px-4 py-3 font-semibold">Enabled</th>
                      <th className="px-4 py-3 font-semibold">Test</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {notificationChannels.map((channel) => {
                      const channelConfig = notificationConfigFromChannel(channel);
                      const isTesting = testingNotificationIds.includes(channel.id);

                      return (
                      <tr key={channel.id}>
                        <td className="px-4 py-3 align-top">
                          <input
                            value={channel.name}
                            onChange={(event) => updateNotificationChannel(channel.id, { name: event.target.value })}
                            className="w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm font-medium text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white"
                          />
                          <div className="mt-1 text-xs uppercase text-slate-500">{channel.type}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-80">
                            {renderNotificationConfigFields(
                              channel.type,
                              channelConfig,
                              (key, value) => {
                                const nextConfig = { ...channelConfig, [key]: value };
                                updateNotificationChannel(channel.id, {
                                  config: nextConfig,
                                  target: notificationTargetFromConfig(channel.type, nextConfig),
                                });
                              }
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={channel.enabled}
                              onChange={(event) => updateNotificationChannel(channel.id, { enabled: event.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            Active
                          </label>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => handleTestNotificationChannel(channel.id)}
                            disabled={isTesting}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Send className={cn("h-3.5 w-3.5", isTesting && "animate-pulse")} />
                            {isTesting ? 'Testing' : 'Test'}
                          </button>
                          {channel.lastTestStatus && (
                            <div className={cn(
                              'mt-2 flex items-center gap-1 text-xs',
                              channel.lastTestStatus === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            )}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {channel.lastTestMessage || (channel.lastTestStatus === 'success' ? 'Test passed' : 'Configuration required')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <button
                            type="button"
                            onClick={async () => {
                              if (await confirmDelete({ title: 'Delete notification channel', itemName: channel.name || channel.type, description: 'Workflows and alerts will no longer send messages through this channel.' })) deleteNotificationChannel(channel.id);
                            }}
                            className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            title="Delete channel"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                    {notificationChannels.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                          No notification channels configured yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold leading-7 text-slate-900 dark:text-white">
                    User Management
                    <UnderDevelopmentBadge />
                  </h2>
                  <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Registered users must be approved here before they can log in to the backend.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  Pending: {users.filter((user) => user.status === 'pending').length}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-[1fr_1.3fr_1fr_150px_190px_130px_auto]">
                <input
                  value={userDraft.name}
                  onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Name"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  type="email"
                  value={userDraft.email}
                  onChange={(event) => setUserDraft((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  type="password"
                  value={userDraft.password}
                  onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Initial password"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <select
                  value={userDraft.role}
                  onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <select
                  value={userDraft.appProfile}
                  onChange={(event) => setUserDraft((current) => ({ ...current, appProfile: event.target.value as AppProfile }))}
                  title="App Profile"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  {APP_PROFILE_OPTIONS.map((profile) => (
                    <option key={profile.value} value={profile.value}>{profile.label}</option>
                  ))}
                </select>
                <select
                  value={userDraft.siteId}
                  onChange={(event) => setUserDraft((current) => ({ ...current, siteId: event.target.value }))}
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">User</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">App Profile</th>
                      <th className="px-4 py-3 font-semibold">Site / Tags</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <input
                            value={user.name}
                            onChange={(event) => updateUser(user.id, { name: event.target.value })}
                            className="block w-full rounded-md border-0 bg-transparent px-2 py-1 font-medium text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white"
                          />
                          <input
                            value={user.email}
                            onChange={(event) => updateUser(user.id, { email: event.target.value })}
                            className="mt-1 block w-full rounded-md border-0 bg-transparent px-2 py-1 text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                            user.status === 'approved' && 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300',
                            user.status === 'pending' && 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
                            user.status === 'rejected' && 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300'
                          )}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={user.role}
                            onChange={(event) => updateUser(user.id, { role: event.target.value })}
                            className="rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            {USER_ROLES.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={getUserAppProfile(user)}
                            onChange={(event) => updateUser(user.id, { appProfile: event.target.value as AppProfile })}
                            className="w-48 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            {APP_PROFILE_OPTIONS.map((profile) => (
                              <option key={profile.value} value={profile.value}>{profile.label}</option>
                            ))}
                          </select>
                          <p className="mt-1 max-w-48 whitespace-normal text-[10px] leading-4 text-slate-400">
                            {APP_PROFILE_OPTIONS.find((profile) => profile.value === getUserAppProfile(user))?.description}
                          </p>
                          <details className="mt-2 max-w-72 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Module access
                            </summary>
                            <div className="mt-2 grid grid-cols-2 gap-1">
                              {FEATURE_ACCESS_OPTIONS.filter((option) => option.key !== 'profile').map((option) => (
                                <label key={option.key} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[10px] text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900">
                                  <input
                                    type="checkbox"
                                    checked={getUserFeatureAccess(user)[option.key]}
                                    onChange={(event) => handleUserFeatureAccessChange(user.id, option.key, event.target.checked)}
                                    className="h-3 w-3 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                  />
                                  <span className="truncate" title={option.description}>{option.label}</span>
                                </label>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleResetUserFeatureAccess(user.id)}
                              className="mt-2 text-[10px] font-semibold text-orange-600 hover:text-orange-500"
                            >
                              Reset to profile defaults
                            </button>
                          </details>
                          <details className="mt-2 max-w-72 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Control access
                            </summary>
                            <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={user.controlAccess?.enabled !== false}
                                onChange={(event) => handleUserControlAccessChange(user.id, { enabled: event.target.checked })}
                                className="h-3 w-3 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                              />
                              Allow control commands
                            </label>
                            <label className="mt-2 block text-[10px] text-slate-500">
                              Allowed Device IDs
                              <input
                                value={(user.controlAccess?.deviceIds || []).join(', ')}
                                onChange={(event) => handleUserControlAccessChange(user.id, { deviceIds: splitCsv(event.target.value) })}
                                placeholder={devices.slice(0, 3).map((device) => device.id).join(', ') || 'empty = all devices'}
                                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                              />
                            </label>
                            <label className="mt-2 block text-[10px] text-slate-500">
                              Allowed Action IDs
                              <input
                                value={(user.controlAccess?.actionIds || []).join(', ')}
                                onChange={(event) => handleUserControlAccessChange(user.id, { actionIds: splitCsv(event.target.value) })}
                                placeholder="power_on, power_off, set_mode"
                                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleResetUserControlAccess(user.id)}
                              className="mt-2 text-[10px] font-semibold text-orange-600 hover:text-orange-500"
                            >
                              Reset control access
                            </button>
                          </details>
                          <details className="mt-2 max-w-72 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Data access
                            </summary>
                            <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={user.dataAccess?.enabled !== false}
                                onChange={(event) => handleUserDataAccessChange(user.id, { enabled: event.target.checked })}
                                className="h-3 w-3 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                              />
                              Allow device data access
                            </label>
                            <label className="mt-2 block text-[10px] text-slate-500">
                              Allowed Site IDs
                              <input
                                value={(user.dataAccess?.siteIds || []).join(', ')}
                                onChange={(event) => handleUserDataAccessChange(user.id, { siteIds: splitCsv(event.target.value) })}
                                placeholder={sites.slice(0, 3).map((site) => site.id).join(', ') || 'empty = role default'}
                                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                              />
                            </label>
                            <label className="mt-2 block text-[10px] text-slate-500">
                              Allowed Device IDs
                              <input
                                value={(user.dataAccess?.deviceIds || []).join(', ')}
                                onChange={(event) => handleUserDataAccessChange(user.id, { deviceIds: splitCsv(event.target.value) })}
                                placeholder={devices.slice(0, 3).map((device) => device.id).join(', ') || 'empty = site scope'}
                                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleResetUserDataAccess(user.id)}
                              className="mt-2 text-[10px] font-semibold text-orange-600 hover:text-orange-500"
                            >
                              Reset data access
                            </button>
                          </details>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={user.siteId}
                            onChange={(event) => updateUser(user.id, { siteId: event.target.value })}
                            className="w-40 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            {sites.map((site) => (
                              <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => approveUser(user.id, user.role, user.siteId, user.appProfile)}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectUser(user.id)}
                              disabled={user.id === currentUser?.id}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (await confirmDelete({ title: 'Delete user', itemName: user.name || user.email, description: 'The user account will be removed from backend access management.' })) deleteUser(user.id);
                              }}
                              disabled={user.id === currentUser?.id}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-x-6 border-t border-slate-200 dark:border-slate-800 px-4 py-4 sm:px-8 bg-slate-50 dark:bg-slate-900/30 rounded-b-lg">
          <button type="button" className="text-sm font-semibold leading-6 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 border border-orange-500"
          >
            {t.common.save}
          </button>
        </div>
      </div>

      {claimLabelModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Claim QR / Label</h3>
                <p className="text-xs text-slate-500">Preview the claim QR and print a device label.</p>
              </div>
              <button
                type="button"
                onClick={() => setClaimLabelModal(null)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[18rem_1fr]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950">
                <img
                  src={claimLabelQrSrc}
                  alt="Claim QR code"
                  className="mx-auto h-64 w-64 rounded bg-white p-3"
                />
                <p className="mt-3 break-all font-mono text-xs text-slate-500">{claimLabelModal.claimLink}</p>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Label Fields</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <span className="block text-xs text-slate-500">Model</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{claimLabelModel ? `${claimLabelModel.modelNo} / ${claimLabelModel.name}` : 'Unknown Model'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500">Serial Number</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">{claimLabelModal.item.serialNumber || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500">Batch</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">{claimLabelModal.item.batchNo || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500">Claim Code</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">{claimLabelModal.item.claimCode || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
                  The QR token is random and does not expose MAC, IMEI, Serial Number, model, or device name. Users still need the Claim Code to bind the device.
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyClaimLink(claimLabelModal.item)}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Link
                  </button>
                  <button
                    type="button"
                    onClick={printClaimLabel}
                    className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                  >
                    <Printer className="h-4 w-4" />
                    Print Label
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
