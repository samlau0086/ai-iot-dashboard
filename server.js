import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import pg from 'pg';
import tls from 'tls';
import {fileURLToPath} from 'url';

const {Pool} = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || process.env.VITE_PORT || 3006);
const distDir = path.join(__dirname, 'dist');
const runtimeConfigPath = path.join(__dirname, 'runtime-config.json');
const ingestToken = process.env.IOT_INGEST_TOKEN || '';
const databaseUrl = process.env.DATABASE_URL || '';
const databaseSsl = process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : undefined;
const db = databaseUrl ? new Pool({connectionString: databaseUrl, ssl: databaseSsl}) : null;
const telemetryMessages = [];
const workflowRuns = [];
const workflowLiveStates = new Map();
const deviceControlCommands = [];
const accessEvents = [];
const maxTelemetryMessages = Number(process.env.IOT_TELEMETRY_BUFFER_SIZE || 500);
const maxWorkflowRuns = Number(process.env.WORKFLOW_RUN_BUFFER_SIZE || 500);
const maxDeviceControlCommands = Number(process.env.DEVICE_CONTROL_BUFFER_SIZE || 500);
const maxAccessEvents = Number(process.env.ACCESS_EVENT_BUFFER_SIZE || 500);
const splitTopics = (value) => Array.isArray(value)
  ? value.map((topic) => String(topic).trim()).filter(Boolean)
  : String(value || '').split(',').map((topic) => topic.trim()).filter(Boolean);
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));
const telemetryMetadataKeys = new Set([
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
const extractTelemetryMetrics = (message = {}) => {
  const nestedMetrics = message.metrics && typeof message.metrics === 'object' && !Array.isArray(message.metrics)
    ? message.metrics
    : {};
  const metrics = {};

  for (const [key, value] of Object.entries(nestedMetrics)) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      metrics[key] = numericValue;
    }
  }

  for (const [key, value] of Object.entries(message)) {
    if (telemetryMetadataKeys.has(key)) continue;
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      metrics[key] = numericValue;
    }
  }

  return metrics;
};
const createDefaultHttpChannels = () => [{
  id: 'http-default',
  name: 'Default HTTP Push',
  enabled: true,
  token: '',
}];
const createEnvMqttChannels = () => (process.env.MQTT_BROKER_URL ? [{
  id: 'mqtt-default',
  name: 'Default MQTT Broker',
  enabled: process.env.MQTT_ENABLED === 'true',
  brokerUrl: process.env.MQTT_BROKER_URL || '',
  username: process.env.MQTT_USERNAME || '',
  password: process.env.MQTT_PASSWORD || '',
  topics: splitTopics(process.env.MQTT_TOPICS || 'devices/+/telemetry'),
}] : []);
let httpPushChannels = createDefaultHttpChannels();
let mqttChannels = createEnvMqttChannels();
let ingestTokens = [];
const mqttRuntimes = new Map();
let lastWorkflowScheduleMinute = '';

try {
  if (fs.existsSync(runtimeConfigPath)) {
    const runtimeConfig = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
    if (runtimeConfig.dataSources) {
      httpPushChannels = Array.isArray(runtimeConfig.dataSources.httpPushChannels)
        ? runtimeConfig.dataSources.httpPushChannels
        : httpPushChannels;
      mqttChannels = Array.isArray(runtimeConfig.dataSources.mqttChannels)
        ? runtimeConfig.dataSources.mqttChannels.map((channel) => ({...channel, topics: splitTopics(channel.topics)}))
        : mqttChannels;
      ingestTokens = Array.isArray(runtimeConfig.dataSources.ingestTokens)
        ? runtimeConfig.dataSources.ingestTokens
        : ingestTokens;
    } else if (runtimeConfig.mqttConfig) {
      mqttChannels = [{
        id: 'mqtt-default',
        name: 'Default MQTT Broker',
        ...runtimeConfig.mqttConfig,
        topics: splitTopics(runtimeConfig.mqttConfig.topics),
      }];
    }
  }
} catch (error) {
  console.warn('Failed to load runtime config:', error.message);
}

const saveRuntimeConfig = () => {
  if (!db) {
    fs.writeFileSync(runtimeConfigPath, JSON.stringify({dataSources: {httpPushChannels, mqttChannels, ingestTokens}}, null, 2));
  }
};

const queryDb = async (sql, params = []) => {
  if (!db) return null;
  return db.query(sql, params);
};

const initDatabase = async () => {
  if (!db) {
    console.warn('DATABASE_URL is not set. Falling back to in-memory runtime data.');
    return;
  }

  await queryDb('CREATE EXTENSION IF NOT EXISTS vector');
  await queryDb(`
    CREATE TABLE IF NOT EXISTS app_state (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await queryDb(`
    CREATE TABLE IF NOT EXISTS telemetry_messages (
      id bigserial PRIMARY KEY,
      device_id text NOT NULL,
      topic text,
      source text NOT NULL DEFAULT 'http',
      payload jsonb NOT NULL,
      metrics jsonb NOT NULL,
      embedding vector(1536),
      received_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await queryDb(`
    CREATE TABLE IF NOT EXISTS workflow_webhook_events (
      id bigserial PRIMARY KEY,
      workflow_id text NOT NULL,
      token text NOT NULL,
      payload jsonb NOT NULL,
      headers jsonb NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await queryDb(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id text PRIMARY KEY,
      workflow_id text NOT NULL,
      workflow_name text NOT NULL,
      trigger_type text NOT NULL,
      event_source text NOT NULL,
      status text NOT NULL,
      event jsonb NOT NULL,
      steps jsonb NOT NULL,
      started_at timestamptz NOT NULL,
      finished_at timestamptz NOT NULL
    )
  `);
  await queryDb(`
    CREATE TABLE IF NOT EXISTS device_control_commands (
      id text PRIMARY KEY,
      device_id text NOT NULL,
      device_name text,
      command text NOT NULL,
      parameters jsonb NOT NULL,
      requested_by text NOT NULL,
      requested_by_role text,
      source text NOT NULL,
      status text NOT NULL,
      result text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `);
  await queryDb(`
    CREATE TABLE IF NOT EXISTS access_events (
      id text PRIMARY KEY,
      access_id text,
      credential_id text,
      credential_type text NOT NULL,
      status text NOT NULL,
      reason text,
      params_snapshot jsonb NOT NULL,
      request_meta jsonb NOT NULL,
      created_at timestamptz NOT NULL
    )
  `);
  await queryDb('CREATE INDEX IF NOT EXISTS idx_telemetry_device_received ON telemetry_messages (device_id, received_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_telemetry_received ON telemetry_messages (received_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_workflow_webhook_events_received ON workflow_webhook_events (workflow_id, received_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started ON workflow_runs (workflow_id, started_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_device_control_commands_created ON device_control_commands (created_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_access_events_created ON access_events (created_at DESC)');

  const dataSourceState = await getAppState('data_source_channels');
  if (dataSourceState) {
    httpPushChannels = Array.isArray(dataSourceState.httpPushChannels)
      ? dataSourceState.httpPushChannels
      : httpPushChannels;
    mqttChannels = Array.isArray(dataSourceState.mqttChannels)
      ? dataSourceState.mqttChannels.map((channel) => ({...channel, topics: splitTopics(channel.topics)}))
      : mqttChannels;
    ingestTokens = Array.isArray(dataSourceState.ingestTokens)
      ? dataSourceState.ingestTokens
      : ingestTokens;
  }

  const ingestTokenState = await getAppState('ingest_tokens');
  if (ingestTokenState) {
    ingestTokens = Array.isArray(ingestTokenState) ? ingestTokenState : ingestTokens;
  } else if (ingestToken && ingestTokens.length === 0) {
    ingestTokens = [{
      id: 'env-ingest-token',
      name: 'Environment fallback token',
      token: ingestToken,
      ownerUserId: 'system',
      ownerName: 'System',
      createdAt: new Date().toISOString(),
      revokedAt: null,
    }];
  }

  if (dataSourceState) {
    return;
  }

  const mqttState = await getAppState('mqtt_config');
  if (mqttState) {
    mqttChannels = [{
      id: 'mqtt-default',
      name: 'Default MQTT Broker',
      ...mqttState,
      topics: splitTopics(mqttState.topics),
    }];
  }
};

const getAppState = async (key) => {
  const result = await queryDb('SELECT value FROM app_state WHERE key = $1', [key]);
  return result?.rows?.[0]?.value || null;
};

const setAppState = async (key, value) => {
  await queryDb(
    `INSERT INTO app_state (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
};

const encodeMqttString = (value) => {
  const content = Buffer.from(String(value));
  const length = Buffer.alloc(2);
  length.writeUInt16BE(content.length, 0);
  return Buffer.concat([length, content]);
};

const encodeMqttLength = (length) => {
  const bytes = [];
  let value = length;

  do {
    let encodedByte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) encodedByte = encodedByte | 128;
    bytes.push(encodedByte);
  } while (value > 0);

  return Buffer.from(bytes);
};

const createMqttPacket = (header, body) => Buffer.concat([
  Buffer.from([header]),
  encodeMqttLength(body.length),
  body,
]);

const createMqttConnectPacket = (config) => {
  const clientId = `ai-iot-dashboard-${Math.random().toString(16).slice(2)}`;
  let flags = 0x02;
  const payload = [encodeMqttString(clientId)];

  if (config.username || config.password) {
    flags = flags | 0x80;
    payload.push(encodeMqttString(config.username || ''));
  }

  if (config.password) {
    flags = flags | 0x40;
    payload.push(encodeMqttString(config.password));
  }

  const keepAlive = Buffer.alloc(2);
  keepAlive.writeUInt16BE(30, 0);

  const variableHeader = Buffer.concat([
    encodeMqttString('MQTT'),
    Buffer.from([4, flags]),
    keepAlive,
  ]);

  return createMqttPacket(0x10, Buffer.concat([variableHeader, ...payload]));
};

const createMqttSubscribePacket = (runtime, topics) => {
  const packetId = runtime.packetId++;
  const packetIdBuffer = Buffer.alloc(2);
  packetIdBuffer.writeUInt16BE(packetId, 0);
  const subscriptions = topics.map((topic) => Buffer.concat([encodeMqttString(topic), Buffer.from([0])]));

  return createMqttPacket(0x82, Buffer.concat([packetIdBuffer, ...subscriptions]));
};

const createMqttPublishPacket = (topic, payload) => {
  return createMqttPacket(0x30, Buffer.concat([
    encodeMqttString(topic),
    Buffer.from(String(payload)),
  ]));
};

const sanitizeHttpChannel = (channel) => ({
  id: String(channel.id || createId('http')),
  name: String(channel.name || 'HTTP Push'),
  enabled: channel.enabled !== false,
  token: String(channel.token || ''),
});

const sanitizeMqttChannel = (channel, existing = null) => ({
  id: String(channel.id || createId('mqtt')),
  name: String(channel.name || 'MQTT Broker'),
  enabled: Boolean(channel.enabled),
  brokerUrl: String(channel.brokerUrl || '').trim(),
  username: String(channel.username || '').trim(),
  password: channel.password === undefined || channel.password === ''
    ? String(existing?.password || '')
    : String(channel.password),
  topics: splitTopics(channel.topics),
});

const publicMqttChannel = (channel) => ({
  id: channel.id,
  name: channel.name,
  enabled: channel.enabled,
  brokerUrl: channel.brokerUrl,
  username: channel.username,
  topics: channel.topics,
});

const createIngestToken = () => `iot_${crypto.randomBytes(24).toString('hex')}`;

const publicIngestToken = (token) => ({
  id: token.id,
  name: token.name,
  token: token.token,
  ownerUserId: token.ownerUserId,
  ownerName: token.ownerName,
  createdAt: token.createdAt,
  revokedAt: token.revokedAt || null,
  lastUsedAt: token.lastUsedAt || null,
  lastUsedSource: token.lastUsedSource || null,
});

const saveIngestTokens = async () => {
  if (db) {
    await setAppState('ingest_tokens', ingestTokens);
  } else {
    saveRuntimeConfig();
  }
};

const getProvidedIngestToken = (req) => req.get('x-iot-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');

const validateIngestToken = async (req, source) => {
  const activeTokens = ingestTokens.filter((token) => !token.revokedAt);
  if (activeTokens.length === 0) return true;

  const providedToken = getProvidedIngestToken(req);
  const matchedToken = activeTokens.find((token) => token.token === providedToken);
  if (!matchedToken) return false;

  matchedToken.lastUsedAt = new Date().toISOString();
  matchedToken.lastUsedSource = source;
  await saveIngestTokens();
  return true;
};

const normalizeApiPath = (value) => {
  if (!value) return '';
  try {
    if (String(value).startsWith('http')) {
      return new URL(value).pathname.replace(/\/+$/, '') || '/';
    }
  } catch (error) {
    return '';
  }

  const pathValue = String(value).trim();
  if (!pathValue) return '';
  return `/${pathValue.replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/';
};

const getDashboardDevices = async () => {
  const state = await getAppState('dashboard_state');
  return Array.isArray(state?.devices) ? state.devices : [];
};

const findDeviceByApiPath = async (requestPath) => {
  const normalizedRequestPath = normalizeApiPath(requestPath);
  const devices = await getDashboardDevices();
  return devices.find((device) => normalizeApiPath(device?.config?.apiPath) === normalizedRequestPath) || null;
};

const getDashboardState = async () => await getAppState('dashboard_state') || {};

const getAccessState = async () => {
  const state = await getDashboardState();
  return {
    accesses: Array.isArray(state.accesses) ? state.accesses : [],
    accessCredentials: Array.isArray(state.accessCredentials) ? state.accessCredentials : [],
  };
};

const patchAccessState = async (patch) => {
  const state = await getDashboardState();
  await setAppState('dashboard_state', {
    ...state,
    ...patch,
  });
};

const publicAccessCredential = (credential) => ({
  id: credential.id,
  accessId: credential.accessId,
  type: credential.type || 'qr',
  name: credential.name,
  enabled: credential.enabled !== false,
  hasLink: Boolean(credential.token),
  hasLatestQrLink: Boolean(credential.latestToken),
  refreshIntervalSeconds: Number(credential.refreshIntervalSeconds || 0),
  periodSeconds: Number(credential.periodSeconds || 3600),
  maxUses: Number(credential.maxUses || 1),
  usedCount: Number(credential.usedCount || 0),
  createdAt: credential.createdAt,
  validFrom: credential.validFrom,
  validUntil: credential.validUntil,
  lastUsedAt: credential.lastUsedAt || null,
});

const createAccessToken = () => crypto.randomBytes(32).toString('base64url');
const canUseLatestQrLink = (credential) => Number(credential?.refreshIntervalSeconds || 0) > 0 && Number(credential?.maxUses || 1) > 1;

const createAccessLink = (req, token) => {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}/a/${token}`;
};

const createLatestQrLink = (req, token) => {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}/q/${token}`;
};

const rotateCredentialIfNeeded = (credential, now = new Date()) => {
  if (!canUseLatestQrLink(credential)) return {credential, rotated: false};
  const refreshMs = Number(credential.refreshIntervalSeconds || 0) * 1000;
  const lastRotatedAt = Date.parse(credential.lastRotatedAt || credential.createdAt || credential.validFrom || '');
  if (!Number.isFinite(lastRotatedAt) || now.getTime() - lastRotatedAt < refreshMs) {
    return {credential, rotated: false};
  }

  const token = createAccessToken();
  return {
    credential: {
      ...credential,
      token,
      tokenHash: hashToken(token),
      usedCount: 0,
      lastRotatedAt: now.toISOString(),
    },
    rotated: true,
  };
};

const persistAccessEvent = async (event) => {
  accessEvents.unshift(event);
  if (accessEvents.length > maxAccessEvents) {
    accessEvents.splice(maxAccessEvents);
  }

  if (db) {
    await queryDb(
      `INSERT INTO access_events (id, access_id, credential_id, credential_type, status, reason, params_snapshot, request_meta, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamptz)`,
      [
        event.id,
        event.accessId || null,
        event.credentialId || null,
        event.credentialType || 'qr',
        event.status,
        event.reason || null,
        JSON.stringify(event.params || {}),
        JSON.stringify(event.request || {}),
        event.createdAt,
      ]
    );
  }
};

const getDashboardWorkflows = async () => {
  const state = await getDashboardState();
  return Array.isArray(state.workflows) ? state.workflows : [];
};

const findDashboardDevice = async (deviceId) => {
  if (!deviceId) return null;
  const devices = await getDashboardDevices();
  return devices.find((device) => {
    const externalDeviceId = device?.config?.externalDeviceId;
    return device.id === deviceId || externalDeviceId === deviceId;
  }) || null;
};

const topicMatches = (pattern, topic) => {
  if (!pattern || !topic) return false;
  const patternParts = String(pattern).split('/');
  const topicParts = String(topic).split('/');

  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const topicPart = topicParts[index];
    if (patternPart === '#') return true;
    if (patternPart !== '+' && patternPart !== topicPart) return false;
  }

  return patternParts.length === topicParts.length;
};

const parseJsonTemplate = (template) => {
  if (!template) return null;
  if (typeof template === 'object') return template;
  try {
    return JSON.parse(String(template));
  } catch (error) {
    return null;
  }
};

const getJsonPathValue = (payload, pathValue) => {
  const pathText = String(pathValue || '').trim();
  if (!pathText) return undefined;
  if (pathText === '$') return payload;
  const normalizedPath = pathText
    .replace(/^\$\./, '')
    .replace(/^\$/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[['"]([^'"]+)['"]\]/g, '.$1');
  if (!normalizedPath) return payload;

  return normalizedPath.split('.').filter(Boolean).reduce((current, part) => (
    current && typeof current === 'object' ? current[part] : undefined
  ), payload);
};

const resolveReceiveTemplate = (template, payload) => {
  if (typeof template === 'string') {
    if (template.trim().startsWith('$')) return getJsonPathValue(payload, template);
    return template;
  }
  if (Array.isArray(template)) return template.map((item) => resolveReceiveTemplate(item, payload));
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, resolveReceiveTemplate(value, payload)]));
  }
  return template;
};

const findDashboardDeviceForTelemetry = async (message) => {
  const deviceId = message.device_id || message.deviceId || message.id;
  const topic = message.mqtt_topic || message.topic;
  const devices = await getDashboardDevices();
  return devices.find((device) => {
    if (deviceId && (device.id === deviceId || device?.config?.externalDeviceId === deviceId)) return true;
    const configuredTopic = device?.config?.mqttTopic;
    return configuredTopic && topic && topicMatches(configuredTopic, topic);
  }) || null;
};

const applyDeviceReceiveTemplate = (message, device) => {
  const template = parseJsonTemplate(device?.config?.mqttReceiveTemplate);
  if (!template) return message;
  const resolved = resolveReceiveTemplate(template, message);
  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) return message;

  return {
    ...message,
    ...resolved,
    device_id: resolved.device_id || resolved.deviceId || resolved.id || message.device_id || message.deviceId || message.id || device?.config?.externalDeviceId || device?.id,
    mqtt_topic: message.mqtt_topic || message.topic,
  };
};

const getMetricValue = (event, metric) => {
  if (!metric) return undefined;
  const metrics = event?.message?.metrics || event?.payload?.metrics || event?.metrics || {};
  return metrics[metric];
};

const compareValues = (left, operator, right) => {
  const numericLeft = Number(left);
  const numericRight = Number(right);
  const canCompareNumbers = Number.isFinite(numericLeft) && Number.isFinite(numericRight);
  const first = canCompareNumbers ? numericLeft : String(left ?? '');
  const second = canCompareNumbers ? numericRight : String(right ?? '');

  switch (operator) {
    case '>': return first > second;
    case '>=': return first >= second;
    case '<': return first < second;
    case '<=': return first <= second;
    case '!=':
    case '!==': return first !== second;
    case '=':
    case '==':
    case '===': return first === second;
    default: return false;
  }
};

const matchesDeviceFilter = (configuredDeviceId, eventDeviceId, dashboardDevice) => {
  if (!configuredDeviceId) return true;
  return configuredDeviceId === eventDeviceId
    || configuredDeviceId === dashboardDevice?.id
    || configuredDeviceId === dashboardDevice?.config?.externalDeviceId;
};

const parseJsonSubset = (value) => {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const objectContainsSubset = (target, subset) => {
  if (!subset || typeof subset !== 'object') return true;
  if (!target || typeof target !== 'object') return false;

  return Object.entries(subset).every(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return objectContainsSubset(target[key], value);
    }

    return target[key] === value;
  });
};

const extractWebhookToken = (endpoint) => String(endpoint || '').split('/').filter(Boolean).pop() || '';

const triggerMatchesEvent = (trigger, event) => {
  const config = trigger.config || {};
  const eventDeviceId = event.deviceId || event.message?.device_id || event.message?.deviceId || event.message?.id;
  const dashboardDevice = event.device || null;

  if (!matchesDeviceFilter(config.device, eventDeviceId, dashboardDevice)) return false;

  if (config.type === 'threshold') {
    if (event.type !== 'telemetry') return false;
    const metricValue = getMetricValue(event, config.metric);
    if (metricValue === undefined) return false;
    return compareValues(metricValue, config.condition || '>', config.value);
  }

  if (config.type === 'offline') {
    if (event.type !== 'telemetry') return false;
    return event.message?.status === 'offline' || dashboardDevice?.status === 'offline';
  }

  if (config.type === 'alert') {
    if (event.type !== 'telemetry') return false;
    const severity = String(event.message?.severity || event.message?.level || event.message?.alertLevel || event.message?.status || '').toLowerCase();
    const expected = String(config.severity || '').toLowerCase();
    return severity === 'warning' || severity === 'critical' || severity === 'emergency' || (expected && severity === expected);
  }

  if (config.type === 'mqtt_message') {
    if (event.type !== 'telemetry' || !String(event.source || '').startsWith('mqtt:')) return false;
    if (config.topic && !topicMatches(config.topic, event.message?.mqtt_topic || event.message?.topic)) return false;
    const subset = parseJsonSubset(config.payload_match);
    return objectContainsSubset(event.message, subset);
  }

  if (config.type === 'webhook') {
    if (event.type !== 'webhook') return false;
    const endpointToken = extractWebhookToken(config.endpoint);
    return !endpointToken || endpointToken === event.token;
  }

  if (config.type === 'access') {
    if (event.type !== 'access') return false;
    return !config.accessId || config.accessId === event.accessId;
  }

  if (config.type === 'schedule') {
    return event.type === 'schedule';
  }

  return false;
};

const cronFieldMatches = (field, value) => {
  const part = String(field || '*').trim();
  if (part === '*') return true;
  if (part.includes(',')) return part.split(',').some((item) => cronFieldMatches(item, value));
  if (part.startsWith('*/')) {
    const interval = Number(part.slice(2));
    return Number.isFinite(interval) && interval > 0 && value % interval === 0;
  }
  return Number(part) === value;
};

const cronMatchesNow = (expression, date = new Date()) => {
  const parts = String(expression || '* * * * *').trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return cronFieldMatches(minute, date.getMinutes())
    && cronFieldMatches(hour, date.getHours())
    && cronFieldMatches(dayOfMonth, date.getDate())
    && cronFieldMatches(month, date.getMonth() + 1)
    && cronFieldMatches(dayOfWeek, date.getDay());
};

const parseConditionExpression = (expression) => {
  const match = String(expression || '').trim().match(/^([a-zA-Z0-9_.-]+)\s*(>=|<=|===|!==|==|!=|>|<|=)\s*(.+)$/);
  if (!match) return null;
  return {metric: match[1], operator: match[2], value: match[3].replace(/^["']|["']$/g, '')};
};

const conditionMatchesEvent = (condition, event, context = {}) => {
  const config = resolveWorkflowValue(condition.config || {}, context);

  if (config.type === 'else' || config.type === 'default') {
    return true;
  }

  if (config.type === 'switch') {
    return true;
  }

  if (config.type === 'case') {
    const scope = {event, context, config};
    const value = getWorkflowScopedValue(config.property || 'event.message.status', scope);
    return compareValues(value, config.condition || '==', config.value);
  }

  if (config.type === 'if' || config.type === 'elif') {
    const eventDeviceId = event.deviceId || event.message?.device_id || event.message?.deviceId || event.message?.id;
    if (!matchesDeviceFilter(config.device, eventDeviceId, event.device)) return false;

    if (config.status && event.message?.status !== config.status && event.device?.status !== config.status) {
      return false;
    }

    if (config.start || config.end) {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const parseMinutes = (value, fallback) => {
        const [hour, minute] = String(value || fallback).split(':').map(Number);
        return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
      };
      const start = parseMinutes(config.start, '00:00');
      const end = parseMinutes(config.end, '23:59');
      const inWindow = start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
      if (!inWindow) return false;
    }

    if (!config.metric) return true;
    const metricValue = getMetricValue(event, config.metric);
    if (metricValue === undefined) return false;
    return compareValues(metricValue, config.condition || '>', config.value);
  }

  if (config.type === 'time_window') {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const parseMinutes = (value) => {
      const [hour, minute] = String(value || '00:00').split(':').map(Number);
      return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
    };
    const start = parseMinutes(config.start);
    const end = parseMinutes(config.end);
    return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
  }

  if (config.type === 'check_state') {
    return matchesDeviceFilter(config.device, event.deviceId, event.device)
      && (!config.status || event.message?.status === config.status || event.device?.status === config.status);
  }

  if (config.type === 'logic_and' || config.type === 'logic_or') {
    const expressions = String(config.preconditions || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (expressions.length === 0) return true;
    const results = expressions.map((expression) => {
      const parsed = parseConditionExpression(expression);
      if (!parsed) return false;
      return compareValues(getMetricValue(event, parsed.metric), parsed.operator, parsed.value);
    });
    return config.type === 'logic_and' ? results.every(Boolean) : results.some(Boolean);
  }

  if (config.type === 'delay') {
    return true;
  }

  return true;
};

const sanitizeWorkflowLogValue = (value, options = {}) => {
  const maxDepth = Number(options.maxDepth || 8);
  const maxArrayLength = Number(options.maxArrayLength || 100);
  const maxStringLength = Number(options.maxStringLength || 4000);

  const sanitize = (item, depth, stack = new WeakSet()) => {
    if (item === null || item === undefined) return item;
    if (typeof item === 'string') {
      return item.length > maxStringLength ? `${item.slice(0, maxStringLength)}... [truncated]` : item;
    }
    if (typeof item === 'number' || typeof item === 'boolean') return item;
    if (typeof item === 'bigint') return item.toString();
    if (typeof item === 'function') return `[Function ${item.name || 'anonymous'}]`;
    if (typeof item !== 'object') return String(item);
    if (item instanceof Date) return item.toISOString();
    if (Buffer.isBuffer(item)) return `[Buffer ${item.length} bytes]`;
    if (stack.has(item)) return '[Circular]';
    if (depth >= maxDepth) return '[MaxDepth]';

    stack.add(item);
    let result;
    if (Array.isArray(item)) {
      result = item.slice(0, maxArrayLength).map((entry) => sanitize(entry, depth + 1, stack));
      if (item.length > maxArrayLength) result.push(`[${item.length - maxArrayLength} more items]`);
    } else {
      result = Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, sanitize(entry, depth + 1, stack)]));
    }
    stack.delete(item);

    return result;
  };

  return sanitize(value, 0);
};

const persistWorkflowRun = async (run) => {
  const safeRun = sanitizeWorkflowLogValue(run);
  workflowRuns.unshift(safeRun);
  if (workflowRuns.length > maxWorkflowRuns) workflowRuns.splice(maxWorkflowRuns);

  if (!db) return;

  await queryDb(
    `INSERT INTO workflow_runs (id, workflow_id, workflow_name, trigger_type, event_source, status, event, steps, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamptz, $10::timestamptz)`,
    [
      safeRun.id,
      safeRun.workflowId,
      safeRun.workflowName,
      safeRun.triggerType,
      safeRun.eventSource,
      safeRun.status,
      JSON.stringify(safeRun.event),
      JSON.stringify(safeRun.steps),
      safeRun.startedAt,
      safeRun.finishedAt,
    ]
  );
};

const updateWorkflowLiveState = (workflow, patch) => {
  const current = workflowLiveStates.get(workflow.id) || {
    runId: createId('live'),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'running',
    currentNodeId: null,
    steps: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  workflowLiveStates.set(workflow.id, next);
  return next;
};

const appendWorkflowLiveStep = (workflow, step) => {
  const current = workflowLiveStates.get(workflow.id);
  const safeStep = sanitizeWorkflowLogValue(step);
  const steps = [...(current?.steps || []), safeStep].slice(-200);
  updateWorkflowLiveState(workflow, {
    steps,
    currentNodeId: safeStep.nodeId,
    status: safeStep.status === 'failed' ? 'failed' : 'running',
  });
};

const completeWorkflowLiveState = (workflow, status, steps) => {
  const current = workflowLiveStates.get(workflow.id);
  updateWorkflowLiveState(workflow, {
    status,
    currentNodeId: null,
    steps: sanitizeWorkflowLogValue(steps || current?.steps || []),
    finishedAt: new Date().toISOString(),
  });
};

const persistDeviceControlCommand = async (command) => {
  deviceControlCommands.unshift(command);
  if (deviceControlCommands.length > maxDeviceControlCommands) {
    deviceControlCommands.splice(maxDeviceControlCommands);
  }

  if (!db) return;

  await queryDb(
    `INSERT INTO device_control_commands (
      id, device_id, device_name, command, parameters, requested_by, requested_by_role,
      source, status, result, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz)`,
    [
      command.id,
      command.deviceId,
      command.deviceName,
      command.command,
      JSON.stringify(command.parameters || {}),
      command.requestedBy,
      command.requestedByRole,
      command.source,
      command.status,
      command.result,
      command.createdAt,
      command.updatedAt,
    ]
  );
};

const updateDeviceControlCommand = async (commandId, patch) => {
  const updatedAt = new Date().toISOString();
  const applyPatch = (command) => ({...command, ...patch, updatedAt});
  const index = deviceControlCommands.findIndex((command) => command.id === commandId);
  let nextCommand = null;

  if (index >= 0) {
    nextCommand = applyPatch(deviceControlCommands[index]);
    deviceControlCommands[index] = nextCommand;
  }

  if (db) {
    const result = await queryDb(
      `UPDATE device_control_commands
       SET status = COALESCE($2, status),
           result = COALESCE($3, result),
           updated_at = $4::timestamptz
       WHERE id = $1
       RETURNING id, device_id AS "deviceId", device_name AS "deviceName", command, parameters,
                 requested_by AS "requestedBy", requested_by_role AS "requestedByRole", source,
                 status, result, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [commandId, patch.status || null, patch.result || null, updatedAt]
    );
    nextCommand = result.rows[0] || nextCommand;
  }

  return nextCommand;
};

const getDeviceCommandTopic = (device) => {
  const explicitTopic = device?.config?.commandTopic || device?.config?.mqttCommandTopic;
  if (explicitTopic) return String(explicitTopic).trim();

  const telemetryTopic = device?.config?.mqttTopic;
  if (telemetryTopic) {
    return `${String(telemetryTopic).replace(/\/telemetry\/?$/, '').replace(/\/+$/, '')}/command`;
  }

  const externalId = device?.config?.externalDeviceId || device?.id;
  return externalId ? `devices/${externalId}/command` : '';
};

const publicDeviceCommandPayload = (command) => ({
  command_id: command.id,
  device_id: command.deviceId,
  command: command.command,
  parameters: command.parameters || {},
  requested_by: command.requestedBy,
  source: command.source,
  timestamp: command.createdAt,
});

const getTemplateContextValue = (context, pathValue) => {
  const pathText = String(pathValue || '').trim();
  if (!pathText) return '';
  return pathText.split('.').reduce((current, part) => (
    current && typeof current === 'object' ? current[part] : undefined
  ), context);
};

const renderDeviceCommandPayload = (command, device) => {
  const template = device?.config?.mqttCommandTemplate;
  if (!template) return publicDeviceCommandPayload(command);

  const context = {
    commandId: command.id,
    command: command.command,
    deviceId: command.deviceId,
    externalDeviceId: device?.config?.externalDeviceId || command.deviceId,
    requestedBy: command.requestedBy,
    source: command.source,
    timestamp: command.createdAt,
    parameters: command.parameters || {},
    parametersJson: JSON.stringify(command.parameters || {}),
  };

  const rendered = String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
    const value = getTemplateContextValue(context, key);
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });

  try {
    return JSON.parse(rendered);
  } catch (error) {
    return rendered;
  }
};

const publishDeviceCommandToMqtt = async (command, device) => {
  const topic = getDeviceCommandTopic(device);
  if (!topic) {
    return {ok: false, message: 'No MQTT command topic configured.'};
  }

  const runtime = Array.from(mqttRuntimes.values()).find((item) => (
    item.config.enabled
    && item.socket
    && item.status?.state === 'connected'
  ));

  if (!runtime) {
    return {ok: false, message: 'No connected MQTT subscriber socket is available for command publish.'};
  }

  const payload = renderDeviceCommandPayload(command, device);
  runtime.socket.write(createMqttPublishPacket(topic, typeof payload === 'string' ? payload : JSON.stringify(payload)));
  return {ok: true, message: `Published to MQTT topic ${topic}`};
};

const dispatchDeviceControlCommand = async (command, device) => {
  if (!device || command.status === 'rejected') return command;

  const protocol = String(device.config?.protocol || '').toLowerCase();
  const dataSource = String(device.config?.dataSource || '').toLowerCase();
  const hasMqttRoute = dataSource === 'mqtt' || protocol === 'mqtt' || Boolean(device.config?.mqttTopic || device.config?.commandTopic || device.config?.mqttCommandTopic);

  if (hasMqttRoute) {
    const publishResult = await publishDeviceCommandToMqtt(command, device);
    if (publishResult.ok) {
      return await updateDeviceControlCommand(command.id, {
        status: 'sent',
        result: `${publishResult.message}. Waiting for device ACK.`,
      }) || command;
    }
  }

  return await updateDeviceControlCommand(command.id, {
    status: 'queued',
    result: 'Queued for device polling. Gateway can fetch it from /api/device-commands/pending.',
  }) || command;
};

const createDeviceControlCommand = async ({
  deviceId,
  command,
  parameters = {},
  requestedBy = 'System',
  requestedByRole = 'System',
  source = 'manual',
}) => {
  const device = await findDashboardDevice(deviceId);
  const createdAt = new Date().toISOString();
  const normalizedCommand = {
    id: createId('cmd'),
    deviceId: device?.id || String(deviceId || ''),
    deviceName: device?.name || String(deviceId || 'Unknown device'),
    command: String(command || 'unknown'),
    parameters: parameters && typeof parameters === 'object' ? parameters : {value: parameters},
    requestedBy,
    requestedByRole,
    source,
    status: device ? 'queued' : 'rejected',
    result: device
      ? 'Command recorded. Downstream protocol connector is pending.'
      : 'Device not found.',
    createdAt,
    updatedAt: createdAt,
  };

  await persistDeviceControlCommand(normalizedCommand);
  return await dispatchDeviceControlCommand(normalizedCommand, device);
};

const normalizeNotificationConfig = (channel = {}) => channel.config && typeof channel.config === 'object'
  ? channel.config
  : {};

const sendBarkNotification = async (channel, payload = {}) => {
  const config = normalizeNotificationConfig(channel);
  const title = payload.title || 'AI IoT Dashboard';
  const body = payload.body || 'Bark notification test message.';
  const rawDeviceKey = String(config.deviceKey || channel.target || '').trim();
  const serverUrl = String(config.serverUrl || 'https://api.day.app').trim().replace(/\/+$/, '');

  if (!rawDeviceKey) {
    return {ok: false, message: 'Bark Device Key is required.'};
  }

  const url = rawDeviceKey.startsWith('http://') || rawDeviceKey.startsWith('https://')
    ? rawDeviceKey
    : `${serverUrl}/${encodeURIComponent(rawDeviceKey)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;

  const response = await fetch(url, {method: 'GET'});
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  const barkOk = response.ok && (!parsed || parsed.code === 200 || parsed.code === 0 || parsed.message === 'success');
  return {
    ok: barkOk,
    message: barkOk
      ? 'Bark test notification sent.'
      : `Bark test failed: ${parsed?.message || text || response.status}`,
    status: response.status,
  };
};

const testNotificationChannel = async (channel) => {
  if (!channel?.enabled) return {ok: false, message: 'Channel is disabled.'};

  if (channel.type === 'bark') {
    return sendBarkNotification(channel);
  }

  if (channel.type === 'webhook') {
    const config = normalizeNotificationConfig(channel);
    const url = config.url || channel.target;
    if (!url) return {ok: false, message: 'Webhook URL is required.'};
    const response = await fetch(url, {
      method: config.method || 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({title: 'AI IoT Dashboard', message: 'Notification channel test message.'}),
    });
    return {ok: response.ok, message: response.ok ? 'Webhook test sent.' : `Webhook test failed: ${response.status}`};
  }

  return {ok: false, message: `${channel.type || 'Unknown'} test connector is not implemented yet.`};
};

const normalizeWorkflowNodeName = (node, fallback = 'node') => String(node?.name || node?.config?.name || node?.config?.type || fallback)
  .trim()
  .replace(/\s+/g, '_')
  .replace(/[.]/g, '_') || fallback;

const buildWorkflowNodeNameMap = (workflow) => {
  const namesById = new Map();
  const usedNames = new Map();
  let currentBranchName = '';

  for (const node of workflow.nodes || []) {
    let name = normalizeWorkflowNodeName(node, node.id);

    if (node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config?.type)) {
      name = currentBranchName || name;
    }

    if (!(node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config?.type))) {
      const count = usedNames.get(name) || 0;
      usedNames.set(name, count + 1);
      if (count > 0) name = `${name}_${count + 1}`;
    }

    if (node.type === 'condition' && ['if', 'switch'].includes(node.config?.type)) {
      currentBranchName = name;
    }

    namesById.set(node.id, name);
  }

  return namesById;
};

const getObjectPath = (target, pathExpression = '') => {
  if (!pathExpression) return target;
  return String(pathExpression)
    .split('.')
    .filter(Boolean)
    .reduce((value, key) => (value == null ? undefined : value[key]), target);
};

const resolveWorkflowReference = (expression, context) => {
  const match = String(expression || '').trim().match(/^\$\.(.+?)\.(input|output|status|nodeId|type)(?:\.(.*))?$/);
  if (!match) return undefined;
  const [, nodeName, section, pathExpression] = match;
  const nodeContext = context[nodeName];
  if (!nodeContext) return undefined;
  return getObjectPath(nodeContext[section], pathExpression);
};

const stringifyReferenceValue = (value) => {
  if (value === undefined || value === null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

const parseJsonConfig = (value, fallback) => {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const setObjectPath = (target, pathExpression, value) => {
  const keys = String(pathExpression || '').split('.').filter(Boolean);
  if (keys.length === 0) return value;
  let current = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
      return;
    }
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  });
  return target;
};

const unitConverters = {
  'C:F': (value) => value * 9 / 5 + 32,
  'F:C': (value) => (value - 32) * 5 / 9,
  'C:K': (value) => value + 273.15,
  'K:C': (value) => value - 273.15,
  'W:kW': (value) => value / 1000,
  'kW:W': (value) => value * 1000,
  'Wh:kWh': (value) => value / 1000,
  'kWh:Wh': (value) => value * 1000,
  'bar:psi': (value) => value * 14.5038,
  'psi:bar': (value) => value / 14.5038,
};

const getWorkflowScopedValue = (pathExpression, scope) => {
  const referenceValue = resolveWorkflowReference(pathExpression, scope.context || {});
  if (referenceValue !== undefined) return referenceValue;
  return getObjectPath(scope, pathExpression);
};

const resolveWorkflowValue = (value, context) => {
  if (typeof value === 'string') {
    const wholeReference = resolveWorkflowReference(value, context);
    if (wholeReference !== undefined) return wholeReference;

    return value.replace(/\$\.(.+?)\.(input|output|status|nodeId|type)(?:\.([A-Za-z0-9_$\u4e00-\u9fa5.-]+))?/g, (match) => {
      const resolved = resolveWorkflowReference(match, context);
      return stringifyReferenceValue(resolved);
    });
  }

  if (Array.isArray(value)) return value.map((item) => resolveWorkflowValue(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveWorkflowValue(item, context)]));
  }

  return value;
};

const createWorkflowNodeInput = (node, event, context) => ({
  config: resolveWorkflowValue(node.config || {}, context),
  event,
});

const createWorkflowTriggerOutput = (trigger, event) => {
  if (trigger?.config?.type === 'access') {
    const params = event?.params && typeof event.params === 'object' && !Array.isArray(event.params)
      ? event.params
      : {};
    return {
      ...event,
      ...params,
      params,
    };
  }

  return event;
};

const recordWorkflowNodeResult = (context, nodeName, step) => {
  context[nodeName] = {
    ...(context[nodeName] || {}),
    nodeId: step.nodeId,
    type: step.type,
    status: step.status,
    input: sanitizeWorkflowLogValue(step.input),
    output: sanitizeWorkflowLogValue(step.output),
  };
};

const parseWorkflowRetryInterval = (value) => {
  const text = String(value || '0').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  const multiplier = unit === 'm' ? 60000 : unit === 's' ? 1000 : 1;
  return Math.max(0, Math.min(amount * multiplier, 30000));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getNodeExecutionPolicy = (node) => ({
  retryEnabled: Boolean(node?.config?.executionPolicy?.retryEnabled),
  retryAttempts: Math.max(1, Math.min(Number(node?.config?.executionPolicy?.retryAttempts || 1) || 1, 10)),
  retryInterval: node?.config?.executionPolicy?.retryInterval || '0s',
  onFailure: ['continue', 'stop'].includes(node?.config?.executionPolicy?.onFailure)
    ? node.config.executionPolicy.onFailure
    : 'stop',
});

const executeWorkflowAction = async (workflow, action, event, context = {}, nodeName = normalizeWorkflowNodeName(action, action.id)) => {
  const input = createWorkflowNodeInput(action, event, context);
  const config = input.config || {};
  const startedAt = new Date().toISOString();
  const baseStep = {
    nodeId: action.id,
    nodeName,
    type: config.type || action.type,
    status: 'success',
    input,
    startedAt,
    finishedAt: startedAt,
    output: null,
  };

  if (config.type === 'webhook') {
    const url = config.url || config.webhookUrl || config.endpoint || config.target;
    if (!url || !String(url).startsWith('http')) {
      return {...baseStep, status: 'skipped', output: 'Webhook action requires url/webhookUrl/target.'};
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({workflow: {id: workflow.id, name: workflow.name}, event, context}),
    });

    return {
      ...baseStep,
      status: response.ok ? 'success' : 'failed',
      finishedAt: new Date().toISOString(),
      output: `POST ${url} -> ${response.status}`,
    };
  }

  if (config.type === 'delay') {
    return {...baseStep, status: 'queued', output: `Delay requested: ${config.duration || '60s'}`};
  }

  if (config.type === 'debug') {
    const expression = String(config.expression || '').trim();
    const resolved = expression ? resolveWorkflowValue(expression, context) : context;
    const contextSnapshot = sanitizeWorkflowLogValue(context);
    return {
      ...baseStep,
      status: 'success',
      output: {
        label: config.label || 'Debug snapshot',
        expression: expression || '$',
        resolved: sanitizeWorkflowLogValue(resolved),
        context: contextSnapshot,
        event: sanitizeWorkflowLogValue(event),
      },
    };
  }

  if (config.type === 'set') {
    const assignments = parseJsonConfig(config.assignments, {});
    const base = config.mergeMode === 'replace' ? {} : {
      ...(event.message && typeof event.message === 'object' ? event.message : {}),
      ...(event.payload && typeof event.payload === 'object' ? event.payload : {}),
    };
    Object.entries(assignments).forEach(([pathExpression, assignmentValue]) => {
      setObjectPath(base, pathExpression, resolveWorkflowValue(assignmentValue, context));
    });
    return {...baseStep, output: base};
  }

  if (config.type === 'function') {
    try {
      const runner = new Function('input', 'event', 'context', 'config', `return (async () => { ${String(config.code || '')} })();`);
      const output = await runner(input, event, context, config);
      return {...baseStep, output};
    } catch (error) {
      return {...baseStep, status: 'failed', output: `Function error: ${error.message}`};
    }
  }

  if (config.type === 'switch') {
    const scope = {input, event, context, config};
    const value = getWorkflowScopedValue(config.property, scope);
    const rules = parseJsonConfig(config.rules, []);
    const matched = (Array.isArray(rules) ? rules : []).filter((rule) => (
      compareValues(value, rule.condition || rule.operator || '==', rule.value)
    ));
    return {
      ...baseStep,
      status: matched.length > 0 ? 'success' : 'skipped',
      output: {property: config.property, value, matched},
    };
  }

  if (config.type === 'http_request') {
    if (!config.url || !String(config.url).startsWith('http')) {
      return {...baseStep, status: 'skipped', output: 'HTTP Request requires an http/https url.'};
    }
    const headers = parseJsonConfig(config.headers, {'content-type': 'application/json'});
    const rawBody = config.body ? resolveWorkflowValue(config.body, context) : undefined;
    const bodyValue = typeof rawBody === 'string' ? parseJsonConfig(rawBody, rawBody) : rawBody;
    const response = await fetch(config.url, {
      method: config.method || 'POST',
      headers,
      body: ['GET', 'HEAD'].includes(String(config.method || 'POST').toUpperCase())
        ? undefined
        : (typeof bodyValue === 'string' ? bodyValue : JSON.stringify(bodyValue ?? {workflow: workflow.id, event})),
    });
    const text = await response.text();
    return {
      ...baseStep,
      status: response.ok ? 'success' : 'failed',
      finishedAt: new Date().toISOString(),
      output: {
        status: response.status,
        ok: response.ok,
        body: parseJsonConfig(text, text),
      },
    };
  }

  if (config.type === 'metric_mapper') {
    const mappings = parseJsonConfig(config.mappings, {});
    const source = event.message && typeof event.message === 'object'
      ? event.message
      : event.payload && typeof event.payload === 'object'
        ? event.payload
        : {};
    const output = {};
    Object.entries(source).forEach(([key, value]) => {
      output[mappings[key] || key] = value;
    });
    return {...baseStep, output};
  }

  if (config.type === 'unit_convert') {
    const scope = {input, event, context, config};
    const rawValue = getWorkflowScopedValue(config.metric, scope);
    const numericValue = Number(rawValue);
    const converterKey = `${config.from}:${config.to}`;
    const converter = unitConverters[converterKey];
    if (!Number.isFinite(numericValue) || !converter) {
      return {...baseStep, status: 'skipped', output: {metric: config.metric, value: rawValue, message: `No converter for ${converterKey}`}};
    }
    const converted = Number(converter(numericValue).toFixed(4));
    return {...baseStep, output: {metric: config.metric, from: config.from, to: config.to, value: converted}};
  }

  if (config.type === 'command_confirm') {
    const commandId = config.commandId || event.commandId;
    const command = deviceControlCommands.find((item) => item.id === commandId);
    return {
      ...baseStep,
      status: command?.status === 'sent' ? 'success' : 'queued',
      output: command
        ? {commandId: command.id, status: command.status, result: command.result}
        : {commandId, status: 'pending', timeout: config.timeout || '30s'},
    };
  }

  if (config.type === 'retry') {
    return {...baseStep, status: 'queued', output: {attempts: Number(config.attempts || 3), interval: config.interval || '10s'}};
  }

  if (config.type === 'error_catch') {
    const failedNodes = Object.entries(context)
      .filter(([, item]) => item?.status === 'failed')
      .map(([name, item]) => ({name, nodeId: item.nodeId, output: item.output}));
    return {
      ...baseStep,
      status: failedNodes.length > 0 ? 'success' : 'skipped',
      output: {failedNodes, fallbackMessage: config.fallbackMessage || ''},
    };
  }

  if (config.type === 'stop_workflow') {
    return {...baseStep, status: 'stopped', output: config.reason || 'Stopped by workflow node'};
  }

  if (config.type === 'mqtt_publish') {
    const command = await createDeviceControlCommand({
      deviceId: resolveWorkflowValue(config.targetExpression || config.deviceExpression || config.target, context) || event.deviceId || event.device?.id,
      command: 'mqtt_publish',
      parameters: {topic: config.topic, payload: config.payload},
      requestedBy: `Workflow: ${workflow.name}`,
      requestedByRole: 'Workflow',
      source: `workflow:${workflow.id}`,
    });
    return {...baseStep, status: command.status, output: {commandId: command.id, command: command.command, status: command.status, result: command.result}};
  }

  if (config.type === 'device_control') {
    const resolvedDeviceId = config.deviceSource === 'expression'
      ? resolveWorkflowValue(config.deviceExpression, context)
      : resolveWorkflowValue(config.device || config.target || config.deviceExpression, context);
    const command = await createDeviceControlCommand({
      deviceId: resolvedDeviceId || event.deviceId || event.device?.id,
      command: config.controlId || config.command || 'device_control',
      parameters: config.parameters && typeof config.parameters === 'object'
        ? config.parameters
        : {value: config.value},
      requestedBy: `Workflow: ${workflow.name}`,
      requestedByRole: 'Workflow',
      source: `workflow:${workflow.id}`,
    });
    return {...baseStep, status: command.status, output: {commandId: command.id, command: command.command, status: command.status, result: command.result, parameters: command.parameters}};
  }

  if (config.type === 'start_backup' || config.type === 'stop_device') {
    const command = await createDeviceControlCommand({
      deviceId: resolveWorkflowValue(config.targetExpression || config.deviceExpression || config.target, context) || event.deviceId || event.device?.id,
      command: config.type,
      parameters: {triggerEvent: event.type},
      requestedBy: `Workflow: ${workflow.name}`,
      requestedByRole: 'Workflow',
      source: `workflow:${workflow.id}`,
    });
    return {...baseStep, status: command.status, output: {commandId: command.id, command: command.command, status: command.status, result: command.result}};
  }

  if (['email', 'whatsapp', 'notification', 'ticket', 'report', 'ai_analyze'].includes(config.type)) {
    return {
      ...baseStep,
      status: 'queued',
      output: {
        message: config.message || config.subject || config.prompt || '',
        config,
        result: `${config.type} action queued for downstream connector.`,
      },
    };
  }

  return {...baseStep, status: 'skipped', output: `Unsupported action type: ${config.type || 'unknown'}`};
};

const executeWorkflowActionWithPolicy = async (workflow, action, event, context = {}, nodeName = normalizeWorkflowNodeName(action, action.id)) => {
  const policy = getNodeExecutionPolicy(action);
  const totalAttempts = policy.retryEnabled ? policy.retryAttempts : 1;
  const retryIntervalMs = parseWorkflowRetryInterval(policy.retryInterval);
  const attempts = [];
  let lastStep = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const step = await executeWorkflowAction(workflow, action, event, context, nodeName);
      attempts.push({attempt, status: step.status, output: step.output});
      lastStep = step;
      if (step.status !== 'failed') break;
    } catch (error) {
      attempts.push({attempt, status: 'failed', output: error.message});
      lastStep = {
        nodeId: action.id,
        nodeName,
        type: action.config?.type || 'action',
        status: 'failed',
        input: createWorkflowNodeInput(action, event, context),
        output: error.message,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    }

    if (attempt < totalAttempts && retryIntervalMs > 0) {
      await sleep(retryIntervalMs);
    }
  }

  if (!lastStep) return executeWorkflowAction(workflow, action, event, context, nodeName);

  if (policy.retryEnabled || lastStep.status === 'failed') {
    lastStep = {
      ...lastStep,
      output: {
        result: lastStep.output,
        executionPolicy: {
          retryEnabled: policy.retryEnabled,
          retryAttempts: totalAttempts,
          retryInterval: policy.retryInterval,
          onFailure: policy.onFailure,
        },
        attempts,
      },
    };
  }

  return lastStep;
};

const shouldStopWorkflowAfterAction = (action, step) => (
  step?.status === 'failed' && getNodeExecutionPolicy(action).onFailure !== 'continue'
);

const executeWorkflowWithEdges = async (workflow, trigger, event, startedAt) => {
  const nodesById = new Map((workflow.nodes || []).map((node) => [node.id, node]));
  const nodeNamesById = buildWorkflowNodeNameMap(workflow);
  const outgoingEdges = new Map();
  for (const edge of workflow.edges || []) {
    if (!outgoingEdges.has(edge.source)) outgoingEdges.set(edge.source, []);
    outgoingEdges.get(edge.source).push(edge);
  }

  const steps = [];
  const context = {};
  const visited = new Set();
  let currentNode = trigger;
  let guard = 0;

  const persistResult = async (status) => {
    const finishedAt = new Date().toISOString();
    completeWorkflowLiveState(workflow, status, steps);
    await persistWorkflowRun({
      id: createId('wfr'),
      workflowId: workflow.id,
      workflowName: workflow.name,
      triggerType: trigger.config?.type || 'unknown',
      eventSource: event.source || event.type,
      status,
      event,
      steps,
      startedAt,
      finishedAt,
    });
  };

  while (currentNode && guard < 200) {
    guard++;
    if (visited.has(currentNode.id)) {
      const step = {
        nodeId: currentNode.id,
        nodeName: nodeNamesById.get(currentNode.id) || normalizeWorkflowNodeName(currentNode, currentNode.id),
        type: currentNode.config?.type || currentNode.type,
        status: 'failed',
        output: 'Workflow graph cycle detected.',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      steps.push(step);
      appendWorkflowLiveStep(workflow, step);
      await persistResult('failed');
      return;
    }
    visited.add(currentNode.id);

    const outgoing = outgoingEdges.get(currentNode.id) || [];
    const nodeName = nodeNamesById.get(currentNode.id) || normalizeWorkflowNodeName(currentNode, currentNode.id);
    updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: currentNode.id});

    if (currentNode.type === 'trigger') {
      const input = createWorkflowNodeInput(currentNode, event, context);
      const output = createWorkflowTriggerOutput(currentNode, event);
      recordWorkflowNodeResult(context, nodeName, {
        nodeId: currentNode.id,
        nodeName,
        type: currentNode.config?.type || 'trigger',
        status: 'success',
        input,
        output,
      });
      appendWorkflowLiveStep(workflow, {
        nodeId: currentNode.id,
        nodeName,
        type: currentNode.config?.type || 'trigger',
        status: 'success',
        output: 'Trigger matched',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      });
      const nextEdge = outgoing.find((edge) => edge.type === 'next') || outgoing[0];
      currentNode = nodesById.get(nextEdge?.target);
      continue;
    }

    if (currentNode.type === 'condition') {
      const input = createWorkflowNodeInput(currentNode, event, context);
      const passed = conditionMatchesEvent(currentNode, event, context);
      const step = {
        nodeId: currentNode.id,
        nodeName,
        type: currentNode.config?.type || 'condition',
        status: passed ? 'success' : 'skipped',
        input,
        output: {
          passed,
          branch: currentNode.config?.type || 'condition',
          message: passed ? 'Condition passed' : 'Condition did not match event',
        },
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      steps.push(step);
      recordWorkflowNodeResult(context, nodeName, step);
      appendWorkflowLiveStep(workflow, step);

      const nextEdge = passed
        ? outgoing.find((edge) => edge.type === 'true' || edge.type === 'next')
        : outgoing.find((edge) => edge.type === 'false');

      if (!nextEdge && !passed) {
        await persistResult('skipped');
        return;
      }

      currentNode = nodesById.get(nextEdge?.target);
      continue;
    }

    if (currentNode.type === 'action') {
      try {
        const step = await executeWorkflowActionWithPolicy(workflow, currentNode, event, context, nodeName);
        steps.push(step);
        recordWorkflowNodeResult(context, nodeName, step);
        appendWorkflowLiveStep(workflow, step);
        if (step.status === 'stopped') {
          await persistResult('stopped');
          return;
        }
        if (shouldStopWorkflowAfterAction(currentNode, step)) {
          await persistResult('failed');
          return;
        }
      } catch (error) {
        const input = createWorkflowNodeInput(currentNode, event, context);
        const step = {
          nodeId: currentNode.id,
          nodeName,
          type: currentNode.config?.type || 'action',
          status: 'failed',
          input,
          output: error.message,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
        steps.push(step);
        recordWorkflowNodeResult(context, nodeName, step);
        appendWorkflowLiveStep(workflow, step);
        if (shouldStopWorkflowAfterAction(currentNode, step)) {
          await persistResult('failed');
          return;
        }
      }

      const nextEdge = outgoing.find((edge) => edge.type === 'next' || edge.type === 'continue');
      currentNode = nodesById.get(nextEdge?.target);
      continue;
    }

    currentNode = undefined;
  }

  if (guard >= 200) {
    const step = {
      nodeId: currentNode?.id || 'workflow',
      nodeName: currentNode ? nodeNamesById.get(currentNode.id) || normalizeWorkflowNodeName(currentNode, currentNode.id) : 'workflow',
      type: 'workflow',
      status: 'failed',
      output: 'Workflow graph execution exceeded step limit.',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    steps.push(step);
    appendWorkflowLiveStep(workflow, step);
    await persistResult('failed');
    return;
  }

  await persistResult(steps.some((step) => step.status === 'failed') ? 'failed' : steps.some((step) => step.status === 'stopped') ? 'stopped' : 'success');
};

const executeWorkflow = async (workflow, trigger, event) => {
  const startedAt = new Date().toISOString();
  updateWorkflowLiveState(workflow, {
    runId: createId('live'),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'running',
    currentNodeId: trigger.id,
    steps: [],
    startedAt,
    finishedAt: undefined,
  });
  if (Array.isArray(workflow.edges) && workflow.edges.length > 0) {
    await executeWorkflowWithEdges(workflow, trigger, event, startedAt);
    return;
  }

  const branchTypes = new Set(['if', 'elif', 'else', 'switch', 'case', 'default']);
  const branchRootTypes = new Set(['if', 'switch']);
  const terminalBranchTypes = new Set(['else', 'default']);
  const getBranchFamily = (type) => (['switch', 'case', 'default'].includes(type) ? 'switch' : 'if');
  const nonTriggerNodes = workflow.nodes.filter((node) => node.type !== 'trigger');
  const branchConditions = nonTriggerNodes.filter((node) => node.type === 'condition' && branchTypes.has(node.config?.type));
  const steps = [];
  const context = {};
  const nodeNamesById = buildWorkflowNodeNameMap(workflow);
  const triggerName = nodeNamesById.get(trigger.id) || normalizeWorkflowNodeName(trigger, trigger.id);
  const triggerOutput = createWorkflowTriggerOutput(trigger, event);
  recordWorkflowNodeResult(context, triggerName, {
    nodeId: trigger.id,
    nodeName: triggerName,
    type: trigger.config?.type || 'trigger',
    status: 'success',
    input: createWorkflowNodeInput(trigger, event, context),
    output: triggerOutput,
  });
  appendWorkflowLiveStep(workflow, {
    nodeId: trigger.id,
    nodeName: triggerName,
    type: trigger.config?.type || 'trigger',
    status: 'success',
    output: 'Trigger matched',
    startedAt,
    finishedAt: new Date().toISOString(),
  });

  if (branchConditions.length > 0) {
    const selectedActions = [];
    let nodeIndex = 0;

    while (nodeIndex < workflow.nodes.length) {
      const node = workflow.nodes[nodeIndex];
      if (node.type === 'trigger') {
        nodeIndex++;
        continue;
      }

      if (node.type === 'condition' && branchTypes.has(node.config?.type)) {
        const branches = [];

        while (
          nodeIndex < workflow.nodes.length
          && workflow.nodes[nodeIndex].type === 'condition'
          && branchTypes.has(workflow.nodes[nodeIndex].config?.type)
        ) {
          const condition = workflow.nodes[nodeIndex];
          const previousBranchType = branches[branches.length - 1]?.condition.config?.type;
          const rootFamily = getBranchFamily(branches[0]?.condition.config?.type || condition.config?.type);
          const conditionFamily = getBranchFamily(condition.config?.type);
          if (
            branches.length > 0
            && (branchRootTypes.has(condition.config?.type) || terminalBranchTypes.has(previousBranchType) || conditionFamily !== rootFamily)
          ) {
            break;
          }

          const actions = [];
          nodeIndex++;

          while (
            nodeIndex < workflow.nodes.length
            && workflow.nodes[nodeIndex].type === 'action'
            && workflow.nodes[nodeIndex].config?.groupId === condition.id
          ) {
            actions.push(workflow.nodes[nodeIndex]);
            nodeIndex++;
          }

          branches.push({condition, actions});
        }

        const branchFamily = getBranchFamily(branches[0]?.condition.config?.type || 'if');
        const branchesToMatch = branchFamily === 'switch' ? branches.slice(1) : branches;

        if (branchFamily === 'switch' && branches[0]) {
          const condition = branches[0].condition;
          const nodeName = nodeNamesById.get(condition.id) || normalizeWorkflowNodeName(condition, condition.id);
          updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: condition.id});
          const input = createWorkflowNodeInput(condition, event, context);
          const step = {
            nodeId: condition.id,
            nodeName,
            type: condition.config?.type || 'condition',
            status: 'success',
            input,
            output: {
              passed: true,
              branch: condition.config?.type || 'switch',
              value: getWorkflowScopedValue(input.config?.property || 'event.message.status', {event, context, config: input.config || {}}),
              message: 'Switch evaluated',
            },
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          };
          steps.push(step);
          recordWorkflowNodeResult(context, nodeName, step);
          appendWorkflowLiveStep(workflow, step);
        }

        const matchedBranch = branchesToMatch.find(({condition}) => {
          const nodeName = nodeNamesById.get(condition.id) || normalizeWorkflowNodeName(condition, condition.id);
          updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: condition.id});
          const input = createWorkflowNodeInput(condition, event, context);
          const passed = conditionMatchesEvent(condition, event, context);
          const step = {
            nodeId: condition.id,
            nodeName,
            type: condition.config?.type || 'condition',
            status: passed ? 'success' : 'skipped',
            input,
            output: {passed, branch: condition.config?.type || 'condition', message: passed ? 'Branch matched' : 'Branch did not match event'},
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          };
          steps.push(step);
          recordWorkflowNodeResult(context, nodeName, step);
          appendWorkflowLiveStep(workflow, step);
          return passed;
        });

        if (!matchedBranch) {
          const finishedAt = new Date().toISOString();
          completeWorkflowLiveState(workflow, 'skipped', steps);
          await persistWorkflowRun({
            id: createId('wfr'),
            workflowId: workflow.id,
            workflowName: workflow.name,
            triggerType: trigger.config?.type || 'unknown',
            eventSource: event.source || event.type,
            status: 'skipped',
            event,
            steps,
            startedAt,
            finishedAt,
          });
          return;
        }

        selectedActions.push(...matchedBranch.actions);
        continue;
      }

      if (node.type === 'condition') {
        const nodeName = nodeNamesById.get(node.id) || normalizeWorkflowNodeName(node, node.id);
        updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: node.id});
        const input = createWorkflowNodeInput(node, event, context);
        const passed = conditionMatchesEvent(node, event, context);
        const step = {
          nodeId: node.id,
          nodeName,
          type: node.config?.type || 'condition',
          status: passed ? 'success' : 'skipped',
          input,
          output: {passed, message: passed ? 'Condition passed' : 'Condition did not match event'},
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
        steps.push(step);
        recordWorkflowNodeResult(context, nodeName, step);
        appendWorkflowLiveStep(workflow, step);
        if (!passed) {
          const finishedAt = new Date().toISOString();
          completeWorkflowLiveState(workflow, 'skipped', steps);
          await persistWorkflowRun({
            id: createId('wfr'),
            workflowId: workflow.id,
            workflowName: workflow.name,
            triggerType: trigger.config?.type || 'unknown',
            eventSource: event.source || event.type,
            status: 'skipped',
            event,
            steps,
            startedAt,
            finishedAt,
          });
          return;
        }
        nodeIndex++;
        continue;
      }

      if (node.type === 'action') {
        selectedActions.push(node);
      }
      nodeIndex++;
    }

    for (const action of selectedActions) {
      try {
        const nodeName = nodeNamesById.get(action.id) || normalizeWorkflowNodeName(action, action.id);
        updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: action.id});
        const step = await executeWorkflowActionWithPolicy(workflow, action, event, context, nodeName);
        steps.push(step);
        recordWorkflowNodeResult(context, nodeName, step);
        appendWorkflowLiveStep(workflow, step);
        if (step.status === 'stopped') break;
        if (shouldStopWorkflowAfterAction(action, step)) break;
      } catch (error) {
        const nodeName = nodeNamesById.get(action.id) || normalizeWorkflowNodeName(action, action.id);
        updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: action.id});
        const input = createWorkflowNodeInput(action, event, context);
        const step = {
          nodeId: action.id,
          nodeName,
          type: action.config?.type || 'action',
          status: 'failed',
          input,
          output: error.message,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
        steps.push(step);
        recordWorkflowNodeResult(context, nodeName, step);
        appendWorkflowLiveStep(workflow, step);
        if (shouldStopWorkflowAfterAction(action, step)) break;
      }
    }

    const finishedAt = new Date().toISOString();
    completeWorkflowLiveState(workflow, steps.some((step) => step.status === 'failed') ? 'failed' : steps.some((step) => step.status === 'stopped') ? 'stopped' : 'success', steps);
    await persistWorkflowRun({
      id: createId('wfr'),
      workflowId: workflow.id,
      workflowName: workflow.name,
      triggerType: trigger.config?.type || 'unknown',
      eventSource: event.source || event.type,
      status: steps.some((step) => step.status === 'failed') ? 'failed' : steps.some((step) => step.status === 'stopped') ? 'stopped' : 'success',
      event,
      steps,
      startedAt,
      finishedAt,
    });
    return;
  }

  const conditions = nonTriggerNodes.filter((node) => node.type === 'condition');
  const actions = nonTriggerNodes.filter((node) => node.type === 'action');

  for (const condition of conditions) {
    const nodeName = nodeNamesById.get(condition.id) || normalizeWorkflowNodeName(condition, condition.id);
    updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: condition.id});
    const input = createWorkflowNodeInput(condition, event, context);
    const passed = conditionMatchesEvent(condition, event, context);
    const step = {
      nodeId: condition.id,
      nodeName,
      type: condition.config?.type || 'condition',
      status: passed ? 'success' : 'skipped',
      input,
      output: {passed, message: passed ? 'Condition passed' : 'Condition did not match event'},
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    steps.push(step);
    recordWorkflowNodeResult(context, nodeName, step);
    appendWorkflowLiveStep(workflow, step);
    if (!passed) {
      const finishedAt = new Date().toISOString();
      completeWorkflowLiveState(workflow, 'skipped', steps);
      await persistWorkflowRun({
        id: createId('wfr'),
        workflowId: workflow.id,
        workflowName: workflow.name,
        triggerType: trigger.config?.type || 'unknown',
        eventSource: event.source || event.type,
        status: 'skipped',
        event,
        steps,
        startedAt,
        finishedAt,
      });
      return;
    }
  }

  for (const action of actions) {
    try {
      const nodeName = nodeNamesById.get(action.id) || normalizeWorkflowNodeName(action, action.id);
      updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: action.id});
      const step = await executeWorkflowActionWithPolicy(workflow, action, event, context, nodeName);
      steps.push(step);
      recordWorkflowNodeResult(context, nodeName, step);
      appendWorkflowLiveStep(workflow, step);
      if (step.status === 'stopped') break;
      if (shouldStopWorkflowAfterAction(action, step)) break;
    } catch (error) {
      const nodeName = nodeNamesById.get(action.id) || normalizeWorkflowNodeName(action, action.id);
      updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: action.id});
      const input = createWorkflowNodeInput(action, event, context);
      const step = {
        nodeId: action.id,
        nodeName,
        type: action.config?.type || 'action',
        status: 'failed',
        input,
        output: error.message,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      steps.push(step);
      recordWorkflowNodeResult(context, nodeName, step);
      appendWorkflowLiveStep(workflow, step);
      if (shouldStopWorkflowAfterAction(action, step)) break;
    }
  }

  const finishedAt = new Date().toISOString();
  completeWorkflowLiveState(workflow, steps.some((step) => step.status === 'failed') ? 'failed' : steps.some((step) => step.status === 'stopped') ? 'stopped' : 'success', steps);
  await persistWorkflowRun({
    id: createId('wfr'),
    workflowId: workflow.id,
    workflowName: workflow.name,
    triggerType: trigger.config?.type || 'unknown',
    eventSource: event.source || event.type,
    status: steps.some((step) => step.status === 'failed') ? 'failed' : steps.some((step) => step.status === 'stopped') ? 'stopped' : 'success',
    event,
    steps,
    startedAt,
    finishedAt,
  });
};

const dispatchWorkflowEvent = async (event) => {
  const workflows = await getDashboardWorkflows();
  const enabledWorkflows = workflows.filter((workflow) => workflow?.enabled);

  await Promise.all(enabledWorkflows.map(async (workflow) => {
    const triggers = workflow.nodes.filter((node) => node.type === 'trigger');
    const matchedTrigger = triggers.find((trigger) => triggerMatchesEvent(trigger, event));

    if (matchedTrigger) await executeWorkflow(workflow, matchedTrigger, event);
  }));
};

const runScheduledWorkflows = async () => {
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  if (minuteKey === lastWorkflowScheduleMinute) return;
  lastWorkflowScheduleMinute = minuteKey;

  const workflows = await getDashboardWorkflows();
  const enabledWorkflows = workflows.filter((workflow) => workflow?.enabled);

  for (const workflow of enabledWorkflows) {
    const scheduleTrigger = workflow.nodes.find((node) => (
      node.type === 'trigger'
      && node.config?.type === 'schedule'
      && cronMatchesNow(node.config?.crontab, now)
    ));

    if (scheduleTrigger) {
      await executeWorkflow(workflow, scheduleTrigger, {
        type: 'schedule',
        source: 'schedule',
        workflowId: workflow.id,
        scheduledAt: now.toISOString(),
        crontab: scheduleTrigger.config?.crontab,
      });
    }
  }
};

const mqttStatusFor = (channelId) => mqttRuntimes.get(channelId)?.status || {
  state: 'disabled',
  message: 'MQTT subscriber is disabled',
  connectedAt: null,
  lastMessageAt: null,
  lastTopic: null,
  receivedCount: 0,
  acceptedCount: 0,
  rejectedCount: 0,
};

const mqttStatuses = () => Object.fromEntries(mqttChannels.map((channel) => [channel.id, mqttStatusFor(channel.id)]));
const mqttObservedTopics = () => Object.fromEntries(mqttChannels.map((channel) => [
  channel.id,
  Array.from(mqttRuntimes.get(channel.id)?.observedTopics || []).sort(),
]));

const rememberMqttTopic = (runtime, topic) => {
  if (!topic) return;
  runtime.observedTopics = runtime.observedTopics || new Set();
  runtime.observedTopics.add(topic);
  if (runtime.observedTopics.size > 100) {
    const oldestTopic = runtime.observedTopics.values().next().value;
    runtime.observedTopics.delete(oldestTopic);
  }
};

const persistTelemetryMessages = async (messages, source = 'http') => {
  if (!db || messages.length === 0) return;

  const values = [];
  const placeholders = messages.map((message, index) => {
    const offset = index * 6;
    values.push(
      message.device_id || message.deviceId || message.id,
      message.mqtt_topic || message.topic || null,
      source,
      JSON.stringify(message),
      JSON.stringify(message.metrics || {}),
      message.received_at
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb, $${offset + 5}::jsonb, $${offset + 6}::timestamptz)`;
  }).join(', ');

  await queryDb(
    `INSERT INTO telemetry_messages (device_id, topic, source, payload, metrics, received_at)
     VALUES ${placeholders}`,
    values
  );
};

const ingestTelemetryPayload = async (payload, source = 'http') => {
  const messages = Array.isArray(payload) ? payload : [payload];
  const accepted = [];

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const device = await findDashboardDeviceForTelemetry(message);
    const normalizedMessage = applyDeviceReceiveTemplate(message, device);
    const deviceId = normalizedMessage.device_id || normalizedMessage.deviceId || normalizedMessage.id || device?.config?.externalDeviceId || device?.id;
    const metrics = extractTelemetryMetrics(normalizedMessage);
    if (!deviceId || Object.keys(metrics).length === 0) continue;

    accepted.push({
      ...normalizedMessage,
      device_id: deviceId,
      metrics,
      source,
      received_at: new Date().toISOString(),
    });
  }

  telemetryMessages.push(...accepted);
  if (telemetryMessages.length > maxTelemetryMessages) {
    telemetryMessages.splice(0, telemetryMessages.length - maxTelemetryMessages);
  }

  await persistTelemetryMessages(accepted, source);

  await Promise.all(accepted.map(async (message) => {
    const deviceId = message.device_id || message.deviceId || message.id;
    const device = await findDashboardDevice(deviceId);
    await dispatchWorkflowEvent({
      type: 'telemetry',
      source,
      deviceId,
      device,
      message,
      receivedAt: message.received_at,
    });
  }));

  return accepted;
};

const stopMqttRuntime = (runtime) => {
  runtime.stopped = true;
  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
  }
  if (runtime.pingTimer) {
    clearInterval(runtime.pingTimer);
    runtime.pingTimer = null;
  }
  if (runtime.socket) {
    const socket = runtime.socket;
    runtime.socket = null;
    socket.destroy();
  }
  runtime.buffer = Buffer.alloc(0);
};

const scheduleMqttReconnect = (runtime) => {
  if (!runtime.config.enabled || runtime.reconnectTimer) return;
  runtime.reconnectTimer = setTimeout(() => {
    runtime.reconnectTimer = null;
    startMqttRuntime(runtime.config);
  }, 5000);
};

const createMqttPubackPacket = (packetId) => {
  const packetIdBuffer = Buffer.alloc(2);
  packetIdBuffer.writeUInt16BE(packetId, 0);
  return createMqttPacket(0x40, packetIdBuffer);
};

const handleMqttPublish = async (runtime, packet, flags) => {
  if (packet.length < 2) return;
  const topicLength = packet.readUInt16BE(0);
  const topicEnd = 2 + topicLength;
  if (packet.length <= topicEnd) return;

  const topic = packet.slice(2, topicEnd).toString();
  const qos = (flags & 0x06) >> 1;
  let payloadStart = topicEnd;

  if (qos > 0) {
    if (packet.length < topicEnd + 2) return;
    const packetId = packet.readUInt16BE(topicEnd);
    payloadStart += 2;
    runtime.socket?.write(createMqttPubackPacket(packetId));
  }

  const payloadText = packet.slice(payloadStart).toString();
  rememberMqttTopic(runtime, topic);
  const now = new Date().toISOString();
  runtime.status = {
    ...runtime.status,
    lastTopic: topic,
    lastMessageAt: now,
    receivedCount: (runtime.status.receivedCount || 0) + 1,
  };

  try {
    const payload = JSON.parse(payloadText);
    const accepted = await ingestTelemetryPayload(
      Array.isArray(payload)
        ? payload.map((item) => ({...item, mqtt_topic: topic}))
        : {...payload, mqtt_topic: topic},
      `mqtt:${runtime.config.id}`
    );
    if (accepted.length > 0) {
      runtime.status = {
        ...runtime.status,
        message: `Accepted ${accepted.length} telemetry message(s) from ${topic}`,
        lastMessageAt: now,
        acceptedCount: (runtime.status.acceptedCount || 0) + accepted.length,
      };
    } else {
      runtime.status = {
        ...runtime.status,
        message: `MQTT payload on ${topic} did not include a device id and numeric metrics`,
        rejectedCount: (runtime.status.rejectedCount || 0) + 1,
      };
    }
  } catch (error) {
    runtime.status = {
      ...runtime.status,
      message: `MQTT payload JSON parse failed on ${topic}`,
      rejectedCount: (runtime.status.rejectedCount || 0) + 1,
    };
  }
};

const handleMqttData = (runtime, chunk) => {
  runtime.buffer = Buffer.concat([runtime.buffer, chunk]);

  while (runtime.buffer.length >= 2) {
    let multiplier = 1;
    let remainingLength = 0;
    let offset = 1;
    let encodedByte = 0;

    do {
      if (offset >= runtime.buffer.length) return;
      encodedByte = runtime.buffer[offset++];
      remainingLength += (encodedByte & 127) * multiplier;
      multiplier *= 128;
    } while ((encodedByte & 128) !== 0);

    const packetEnd = offset + remainingLength;
    if (runtime.buffer.length < packetEnd) return;

    const fixedHeader = runtime.buffer[0];
    const packetType = fixedHeader >> 4;
    const flags = fixedHeader & 0x0f;
    const packet = runtime.buffer.slice(offset, packetEnd);
    runtime.buffer = runtime.buffer.slice(packetEnd);

    if (packetType === 2) {
      const returnCode = packet[1];
      if (returnCode === 0) {
        runtime.status = {...runtime.status, state: 'connected', message: 'Connected to MQTT broker', connectedAt: new Date().toISOString()};
        if (runtime.config.topics.length > 0) {
          runtime.socket?.write(createMqttSubscribePacket(runtime, runtime.config.topics));
        }
      } else {
        runtime.status = {state: 'error', message: `MQTT CONNACK rejected with code ${returnCode}`, connectedAt: null, lastMessageAt: runtime.status.lastMessageAt};
        runtime.socket?.destroy();
      }
    }

    if (packetType === 3) {
      handleMqttPublish(runtime, packet, flags).catch((error) => {
        runtime.status = {...runtime.status, message: error.message};
      });
    }

    if (packetType === 9) {
      const returnCodes = Array.from(packet.slice(2));
      const rejectedTopics = runtime.config.topics.filter((_, index) => returnCodes[index] === 0x80);
      if (rejectedTopics.length > 0) {
        runtime.status = {
          ...runtime.status,
          state: 'error',
          message: `MQTT subscription rejected for: ${rejectedTopics.join(', ')}`,
        };
      } else {
        runtime.status = {
          ...runtime.status,
          state: 'connected',
          message: `Subscribed to ${runtime.config.topics.join(', ')}`,
        };
      }
    }
  }
};

const startMqttRuntime = (config) => {
  const previous = mqttRuntimes.get(config.id);
  if (previous) stopMqttRuntime(previous);

  const runtime = previous || {
    config,
    socket: null,
    reconnectTimer: null,
    pingTimer: null,
    packetId: 1,
    buffer: Buffer.alloc(0),
    status: {state: 'disabled', message: 'MQTT subscriber is disabled', connectedAt: null, lastMessageAt: null},
    observedTopics: new Set(),
  };
  runtime.config = config;
  runtime.observedTopics = runtime.observedTopics || new Set();
  runtime.stopped = false;
  mqttRuntimes.set(config.id, runtime);

  if (!config.enabled) {
    runtime.status = {state: 'disabled', message: 'MQTT subscriber is disabled', connectedAt: null, lastMessageAt: runtime.status.lastMessageAt};
    return;
  }

  if (!config.brokerUrl || config.topics.length === 0) {
    runtime.status = {state: 'error', message: 'MQTT broker URL and at least one topic are required', connectedAt: null, lastMessageAt: runtime.status.lastMessageAt};
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(config.brokerUrl);
    runtime.config = {
      ...config,
      username: config.username || decodeURIComponent(parsedUrl.username || ''),
      password: config.password || decodeURIComponent(parsedUrl.password || ''),
    };
  } catch (error) {
    runtime.status = {state: 'error', message: 'Invalid MQTT broker URL', connectedAt: null, lastMessageAt: runtime.status.lastMessageAt};
    return;
  }

  const isTls = parsedUrl.protocol === 'mqtts:';
  if (!isTls && parsedUrl.protocol !== 'mqtt:') {
    runtime.status = {state: 'error', message: 'Only mqtt:// and mqtts:// broker URLs are supported by the backend subscriber', connectedAt: null, lastMessageAt: runtime.status.lastMessageAt};
    return;
  }

  runtime.status = {state: 'connecting', message: 'Connecting to MQTT broker', connectedAt: null, lastMessageAt: runtime.status.lastMessageAt};
  const portNumber = Number(parsedUrl.port || (isTls ? 8883 : 1883));
  const connectionOptions = {host: parsedUrl.hostname, port: portNumber};

  const socket = isTls ? tls.connect(connectionOptions) : net.connect(connectionOptions);
  runtime.socket = socket;

  socket.on('connect', () => {
    socket.write(createMqttConnectPacket(runtime.config));
    runtime.pingTimer = setInterval(() => {
      socket.write(Buffer.from([0xc0, 0x00]));
    }, 25000);
  });

  socket.on('data', (chunk) => handleMqttData(runtime, chunk));
  socket.on('error', (error) => {
    runtime.status = {state: 'error', message: error.message, connectedAt: null, lastMessageAt: runtime.status.lastMessageAt};
  });
  socket.on('close', () => {
    if (runtime.pingTimer) {
      clearInterval(runtime.pingTimer);
      runtime.pingTimer = null;
    }
    if (runtime.socket !== socket) return;
    runtime.socket = null;
    if (runtime.config.enabled && !runtime.stopped) {
      runtime.status = {state: 'reconnecting', message: 'MQTT connection closed, reconnecting', connectedAt: null, lastMessageAt: runtime.status.lastMessageAt};
      scheduleMqttReconnect(runtime);
    }
  });
};

const startMqttSubscribers = () => {
  const activeIds = new Set(mqttChannels.map((channel) => channel.id));
  for (const [channelId, runtime] of mqttRuntimes.entries()) {
    if (!activeIds.has(channelId)) {
      stopMqttRuntime(runtime);
      mqttRuntimes.delete(channelId);
    }
  }
  mqttChannels.forEach((channel) => startMqttRuntime(channel));
};

app.disable('x-powered-by');
app.use(express.json({limit: '1mb'}));
app.use(express.static(distDir, {
  index: false,
  maxAge: '1h',
}));

app.get('/health', (_req, res) => {
  res.status(200).json({status: 'ok'});
});

app.get('/api/ingest-tokens', (_req, res) => {
  res.status(200).json({tokens: ingestTokens.map(publicIngestToken)});
});

app.post('/api/ingest-tokens', async (req, res) => {
  try {
    const payload = req.body || {};
    const token = {
      id: createId('ingest-token'),
      name: String(payload.name || 'Device ingest token').trim(),
      token: createIngestToken(),
      ownerUserId: String(payload.ownerUserId || 'unknown'),
      ownerName: String(payload.ownerName || 'Unknown user'),
      createdAt: new Date().toISOString(),
      revokedAt: null,
      lastUsedAt: null,
      lastUsedSource: null,
    };
    ingestTokens = [token, ...ingestTokens];
    await saveIngestTokens();
    res.status(201).json({token: publicIngestToken(token), tokens: ingestTokens.map(publicIngestToken)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/ingest-tokens/:tokenId/revoke', async (req, res) => {
  try {
    const revokedAt = new Date().toISOString();
    let found = false;
    ingestTokens = ingestTokens.map((token) => {
      if (token.id !== req.params.tokenId) return token;
      found = true;
      return {...token, revokedAt: token.revokedAt || revokedAt};
    });
    if (!found) {
      res.status(404).json({error: 'ingest token not found'});
      return;
    }
    await saveIngestTokens();
    res.status(200).json({tokens: ingestTokens.map(publicIngestToken)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/data-sources', (_req, res) => {
  res.status(200).json({
    httpPushChannels: httpPushChannels.map(sanitizeHttpChannel),
    mqttChannels: mqttChannels.map(publicMqttChannel),
    mqttStatuses: mqttStatuses(),
    mqttObservedTopics: mqttObservedTopics(),
  });
});

app.post('/api/data-sources', async (req, res) => {
  try {
    const payload = req.body || {};
    const previousMqttById = new Map(mqttChannels.map((channel) => [channel.id, channel]));
    httpPushChannels = Array.isArray(payload.httpPushChannels)
      ? payload.httpPushChannels.map(sanitizeHttpChannel)
      : httpPushChannels;
    mqttChannels = Array.isArray(payload.mqttChannels)
      ? payload.mqttChannels.map((channel) => sanitizeMqttChannel(channel, previousMqttById.get(channel.id)))
      : mqttChannels;

    if (db) {
      await setAppState('data_source_channels', {httpPushChannels, mqttChannels});
    } else {
      saveRuntimeConfig();
    }

    startMqttSubscribers();
    res.status(200).json({
      httpPushChannels: httpPushChannels.map(sanitizeHttpChannel),
      mqttChannels: mqttChannels.map(publicMqttChannel),
      mqttStatuses: mqttStatuses(),
      mqttObservedTopics: mqttObservedTopics(),
    });
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/accesses', async (_req, res) => {
  try {
    const {accesses, accessCredentials} = await getAccessState();
    res.status(200).json({
      accesses,
      credentials: accessCredentials.map(publicAccessCredential),
    });
  } catch (error) {
    res.status(500).json({error: error.message, accesses: [], credentials: []});
  }
});

app.post('/api/accesses', async (req, res) => {
  try {
    const {accesses, accessCredentials} = await getAccessState();
    const now = new Date().toISOString();
    const payload = req.body || {};
    const access = {
      id: payload.id || createId('access'),
      name: String(payload.name || 'New Access').trim(),
      enabled: payload.enabled !== false,
      method: payload.method || 'qr',
      extraParams: payload.extraParams && typeof payload.extraParams === 'object' ? payload.extraParams : {},
      createdAt: now,
      updatedAt: now,
    };
    const nextAccesses = [access, ...accesses.filter((item) => item.id !== access.id)];
    await patchAccessState({accesses: nextAccesses, accessCredentials});
    res.status(201).json({access, accesses: nextAccesses});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.put('/api/accesses/:accessId', async (req, res) => {
  try {
    const {accesses, accessCredentials} = await getAccessState();
    const patch = req.body || {};
    let found = false;
    const nextAccesses = accesses.map((access) => {
      if (access.id !== req.params.accessId) return access;
      found = true;
      return {
        ...access,
        ...patch,
        extraParams: patch.extraParams && typeof patch.extraParams === 'object' ? patch.extraParams : access.extraParams,
        updatedAt: new Date().toISOString(),
      };
    });
    if (!found) {
      res.status(404).json({error: 'access not found'});
      return;
    }
    await patchAccessState({accesses: nextAccesses, accessCredentials});
    res.status(200).json({accesses: nextAccesses});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.delete('/api/accesses/:accessId', async (req, res) => {
  try {
    const {accesses, accessCredentials} = await getAccessState();
    const nextAccesses = accesses.filter((access) => access.id !== req.params.accessId);
    const nextCredentials = accessCredentials.filter((credential) => credential.accessId !== req.params.accessId);
    await patchAccessState({accesses: nextAccesses, accessCredentials: nextCredentials});
    res.status(200).json({accesses: nextAccesses, credentials: nextCredentials.map(publicAccessCredential)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/accesses/:accessId/credentials', async (req, res) => {
  try {
    const {accesses, accessCredentials} = await getAccessState();
    const access = accesses.find((item) => item.id === req.params.accessId);
    if (!access) {
      res.status(404).json({error: 'access not found'});
      return;
    }

    const payload = req.body || {};
    const token = createAccessToken();
    const refreshIntervalSeconds = Math.max(0, Number(payload.refreshIntervalSeconds || 0) || 0);
    const maxUses = Math.max(1, Math.min(Number(payload.maxUses || 1) || 1, 100000));
    const now = new Date();
    const requestedValidUntil = payload.validUntil ? new Date(payload.validUntil) : null;
    const validUntil = requestedValidUntil && Number.isFinite(requestedValidUntil.getTime()) && requestedValidUntil > now
      ? requestedValidUntil
      : new Date(now.getTime() + Math.max(30, Math.min(Number(payload.periodSeconds || 3600) || 3600, 31536000)) * 1000);
    const periodSeconds = Math.max(30, Math.ceil((validUntil.getTime() - now.getTime()) / 1000));
    const credential = {
      id: createId('access-cred'),
      accessId: access.id,
      type: payload.type || 'qr',
      name: String(payload.name || 'QR Code').trim(),
      token,
      tokenHash: hashToken(token),
      latestToken: refreshIntervalSeconds > 0 && maxUses > 1 ? createAccessToken() : null,
      enabled: payload.enabled !== false,
      refreshIntervalSeconds,
      periodSeconds,
      maxUses,
      usedCount: 0,
      createdAt: now.toISOString(),
      validFrom: now.toISOString(),
      validUntil: validUntil.toISOString(),
      lastRotatedAt: now.toISOString(),
      lastUsedAt: null,
    };
    const nextCredentials = [credential, ...accessCredentials];
    await patchAccessState({accesses, accessCredentials: nextCredentials});
    res.status(201).json({
      credential: publicAccessCredential(credential),
      credentials: nextCredentials.map(publicAccessCredential),
      link: createAccessLink(req, token),
      latestQrLink: credential.latestToken ? createLatestQrLink(req, credential.latestToken) : null,
    });
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.put('/api/access-credentials/:credentialId', async (req, res) => {
  try {
    const {accesses, accessCredentials} = await getAccessState();
    const patch = req.body || {};
    let found = false;
    const nextCredentials = accessCredentials.map((credential) => {
      if (credential.id !== req.params.credentialId) return credential;
      found = true;
      const nextPeriodSeconds = patch.periodSeconds !== undefined
        ? Math.max(30, Math.min(Number(patch.periodSeconds || 3600) || 3600, 31536000))
        : credential.periodSeconds;
      const requestedValidUntil = patch.validUntil ? new Date(patch.validUntil) : null;
      const hasValidUntilPatch = requestedValidUntil && Number.isFinite(requestedValidUntil.getTime()) && requestedValidUntil > new Date();
      const periodChanged = hasValidUntilPatch || (patch.periodSeconds !== undefined && Number(patch.periodSeconds) !== Number(credential.periodSeconds));
      const nextMaxUses = patch.maxUses !== undefined
        ? Math.max(1, Math.min(Number(patch.maxUses || 1) || 1, 100000))
        : credential.maxUses;
      const nextRefreshIntervalSeconds = patch.refreshIntervalSeconds !== undefined
        ? Math.max(0, Number(patch.refreshIntervalSeconds || 0) || 0)
        : Number(credential.refreshIntervalSeconds || 0);
      const shouldHaveLatestToken = nextRefreshIntervalSeconds > 0 && nextMaxUses > 1;
      return {
        ...credential,
        ...patch,
        periodSeconds: nextPeriodSeconds,
        maxUses: nextMaxUses,
        refreshIntervalSeconds: nextRefreshIntervalSeconds,
        validUntil: hasValidUntilPatch
          ? requestedValidUntil.toISOString()
          : periodChanged
            ? new Date(Date.now() + nextPeriodSeconds * 1000).toISOString()
            : credential.validUntil,
        token: credential.token,
        latestToken: shouldHaveLatestToken ? (credential.latestToken || createAccessToken()) : null,
        tokenHash: credential.tokenHash,
        usedCount: Number.isFinite(Number(patch.usedCount)) ? Number(patch.usedCount) : credential.usedCount,
      };
    });
    if (!found) {
      res.status(404).json({error: 'credential not found'});
      return;
    }
    await patchAccessState({accesses, accessCredentials: nextCredentials});
    res.status(200).json({credentials: nextCredentials.map(publicAccessCredential)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/access-credentials/:credentialId/link', async (req, res) => {
  try {
    const {accesses, accessCredentials} = await getAccessState();
    const credential = accessCredentials.find((item) => item.id === req.params.credentialId);
    if (!credential) {
      res.status(404).json({error: 'credential not found'});
      return;
    }
    if (!credential.token) {
      res.status(409).json({error: 'this credential was created before QR link viewing was supported; generate a new QR credential'});
      return;
    }
    const rotated = rotateCredentialIfNeeded(credential, new Date());
    let nextCredentials = accessCredentials;
    if (rotated.rotated) {
      nextCredentials = accessCredentials.map((item) => item.id === credential.id ? rotated.credential : item);
      await patchAccessState({accesses, accessCredentials: nextCredentials});
    }
    res.status(200).json({
      link: createAccessLink(req, rotated.credential.token),
      latestQrLink: rotated.credential.latestToken ? createLatestQrLink(req, rotated.credential.latestToken) : null,
      credentials: nextCredentials.map(publicAccessCredential),
    });
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.delete('/api/access-credentials/:credentialId', async (req, res) => {
  try {
    const {accesses, accessCredentials} = await getAccessState();
    const nextCredentials = accessCredentials.filter((credential) => credential.id !== req.params.credentialId);
    await patchAccessState({accesses, accessCredentials: nextCredentials});
    res.status(200).json({credentials: nextCredentials.map(publicAccessCredential)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/access-events', async (req, res) => {
  try {
    const accessId = typeof req.query.accessId === 'string' ? req.query.accessId.trim() : '';
    const credentialId = typeof req.query.credentialId === 'string' ? req.query.credentialId.trim() : '';
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
    const {accesses, accessCredentials} = await getAccessState();
    const accessById = new Map(accesses.map((access) => [access.id, access]));
    const credentialById = new Map(accessCredentials.map((credential) => [credential.id, credential]));
    const enrichEvent = (event) => {
      const credential = credentialById.get(event.credentialId);
      const access = accessById.get(event.accessId);
      return {
        ...event,
        accessName: event.accessName || access?.name || '',
        credentialName: event.credentialName || credential?.name || event.credentialId || '',
      };
    };

    if (db) {
      const values = [];
      const where = [];
      if (accessId) {
        values.push(accessId);
        where.push(`access_id = $${values.length}`);
      }
      if (credentialId) {
        values.push(credentialId);
        where.push(`credential_id = $${values.length}`);
      }
      values.push(limit);
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const result = await queryDb(
        `SELECT id, access_id AS "accessId", credential_id AS "credentialId", credential_type AS "credentialType",
                status, reason, params_snapshot AS params, request_meta AS request, created_at AS "createdAt"
         FROM access_events
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${values.length}`,
        values
      );
      res.status(200).json({events: result.rows.map(enrichEvent)});
      return;
    }
    res.status(200).json({
      events: accessEvents
        .filter((event) => !accessId || event.accessId === accessId)
        .filter((event) => !credentialId || event.credentialId === credentialId)
        .slice(0, limit)
        .map(enrichEvent),
    });
  } catch (error) {
    res.status(500).json({error: error.message, events: []});
  }
});

app.get('/api/mqtt/config', (_req, res) => {
  const channel = mqttChannels[0] || sanitizeMqttChannel({});
  res.status(200).json({
    config: {
      enabled: channel.enabled,
      brokerUrl: channel.brokerUrl,
      username: channel.username,
      topics: channel.topics,
    },
    status: mqttStatusFor(channel.id),
  });
});

app.post('/api/mqtt/config', async (req, res) => {
  try {
    const nextConfig = req.body || {};
    mqttChannels = [sanitizeMqttChannel({
      id: mqttChannels[0]?.id || 'mqtt-default',
      name: mqttChannels[0]?.name || 'Default MQTT Broker',
      ...nextConfig,
    }, mqttChannels[0])];
    if (db) {
      await setAppState('data_source_channels', {httpPushChannels, mqttChannels});
    } else {
      saveRuntimeConfig();
    }

    startMqttSubscribers();
    const channel = mqttChannels[0];
    res.status(200).json({
      config: {
        enabled: channel.enabled,
        brokerUrl: channel.brokerUrl,
        username: channel.username,
        topics: channel.topics,
      },
      status: mqttStatusFor(channel.id),
    });
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/telemetry/:channelId/:token', async (req, res) => {
  try {
    const channel = httpPushChannels.find((item) => item.id === req.params.channelId);
    if (!channel || !channel.enabled) {
      res.status(404).json({error: 'telemetry channel not found'});
      return;
    }
    if (channel.token && req.params.token !== channel.token) {
      res.status(401).json({error: 'invalid telemetry token'});
      return;
    }

    const accepted = await ingestTelemetryPayload(req.body, `http:${channel.id}`);
    res.status(202).json({accepted: accepted.length});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/telemetry', async (req, res) => {
  try {
    const isAuthorized = await validateIngestToken(req, 'http:legacy');
    if (!isAuthorized) {
      res.status(401).json({error: 'invalid telemetry token'});
      return;
    }

    const accepted = await ingestTelemetryPayload(req.body, 'http:legacy');

    res.status(202).json({accepted: accepted.length});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('*', async (req, res, next) => {
  try {
    const device = await findDeviceByApiPath(req.path);
    if (!device) {
      next();
      return;
    }

    const isAuthorized = await validateIngestToken(req, `http:path:${req.path}`);
    if (!isAuthorized) {
      res.status(401).json({error: 'invalid telemetry token'});
      return;
    }

    const payload = req.body || {};
    const externalDeviceId = device.config?.externalDeviceId || device.id;
    const enrichMessage = (message) => {
      const baseMessage = message && typeof message === 'object' ? message : {};
      return {
        ...baseMessage,
        device_id: baseMessage.device_id || baseMessage.deviceId || baseMessage.id || externalDeviceId,
        device_type: baseMessage.device_type || baseMessage.type || device.type,
        site_id: baseMessage.site_id || baseMessage.siteId || device.siteId,
        tenant_id: baseMessage.tenant_id || baseMessage.tenantId || device.tenantId,
        tags: baseMessage.tags || device.tags || [],
      };
    };
    const accepted = await ingestTelemetryPayload(
      Array.isArray(payload) ? payload.map(enrichMessage) : enrichMessage(payload),
      `http:path:${req.path}`
    );

    res.status(202).json({accepted: accepted.length, deviceId: device.id});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/telemetry', async (req, res) => {
  try {
    const since = typeof req.query.since === 'string' ? req.query.since : '';
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    const metric = typeof req.query.metric === 'string' ? req.query.metric.trim() : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : '';
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const limit = Math.max(1, Math.min(Number(req.query.limit || (since ? 500 : 100)), 1000));
    let messages;

    if (db) {
      const where = [];
      const values = [];
      const addParam = (value) => {
        values.push(value);
        return `$${values.length}`;
      };

      if (since) where.push(`received_at > ${addParam(since)}::timestamptz`);
      if (from) where.push(`received_at >= ${addParam(from)}::timestamptz`);
      if (to) where.push(`received_at <= ${addParam(to)}::timestamptz`);
      if (deviceId) where.push(`device_id = ${addParam(deviceId)}`);
      if (source) where.push(`source ILIKE ${addParam(`%${source}%`)}`);
      if (metric) where.push(`metrics ? ${addParam(metric)}`);

      const limitParam = addParam(limit);
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const orderDirection = since ? 'ASC' : 'DESC';
      const result = await queryDb(
        `SELECT id, device_id, topic, source, payload, metrics, received_at,
                payload || jsonb_build_object(
                  'received_at', received_at,
                  'mqtt_topic', topic,
                  'source', source
                ) AS message
         FROM telemetry_messages
         ${whereSql}
         ORDER BY received_at ${orderDirection}
         LIMIT ${limitParam}`,
        values
      );
      messages = result.rows.map((row) => row.message);
      if (!since) messages.reverse();
    } else {
      messages = telemetryMessages
        .filter((message) => !since || message.received_at > since)
        .filter((message) => !from || message.received_at >= from)
        .filter((message) => !to || message.received_at <= to)
        .filter((message) => !deviceId || (message.device_id || message.deviceId || message.id) === deviceId)
        .filter((message) => !source || String(message.source || '').toLowerCase().includes(source.toLowerCase()))
        .filter((message) => !metric || Object.prototype.hasOwnProperty.call(message.metrics || {}, metric))
        .slice(-limit);
    }

    res.status(200).json({messages});
  } catch (error) {
    res.status(500).json({error: error.message, messages: []});
  }
});

app.get('/api/device-commands', async (req, res) => {
  try {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));

    if (db) {
      const result = deviceId
        ? await queryDb(
          `SELECT id, device_id AS "deviceId", device_name AS "deviceName", command, parameters,
                  requested_by AS "requestedBy", requested_by_role AS "requestedByRole", source,
                  status, result, created_at AS "createdAt", updated_at AS "updatedAt"
           FROM device_control_commands
           WHERE device_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [deviceId, limit]
        )
        : await queryDb(
          `SELECT id, device_id AS "deviceId", device_name AS "deviceName", command, parameters,
                  requested_by AS "requestedBy", requested_by_role AS "requestedByRole", source,
                  status, result, created_at AS "createdAt", updated_at AS "updatedAt"
           FROM device_control_commands
           ORDER BY created_at DESC
           LIMIT $1`,
          [limit]
        );
      res.status(200).json({commands: result.rows});
      return;
    }

    const commands = deviceControlCommands
      .filter((command) => !deviceId || command.deviceId === deviceId)
      .slice(0, limit);
    res.status(200).json({commands});
  } catch (error) {
    res.status(500).json({error: error.message, commands: []});
  }
});

app.get('/api/device-commands/pending', async (req, res) => {
  try {
    const isAuthorized = await validateIngestToken(req, 'command:pending');
    if (!isAuthorized) {
      res.status(401).json({error: 'invalid ingest token', commands: []});
      return;
    }

    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
    const limit = Math.max(1, Math.min(Number(req.query.limit || 20), 100));

    if (!deviceId) {
      res.status(400).json({error: 'deviceId is required', commands: []});
      return;
    }

    const device = await findDashboardDevice(deviceId);
    if (!device) {
      res.status(404).json({error: 'device not found', commands: []});
      return;
    }

    if (db) {
      const result = await queryDb(
        `SELECT id, device_id AS "deviceId", device_name AS "deviceName", command, parameters,
                requested_by AS "requestedBy", requested_by_role AS "requestedByRole", source,
                status, result, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM device_control_commands
         WHERE device_id = $1 AND status = 'queued'
         ORDER BY created_at ASC
         LIMIT $2`,
        [device.id, limit]
      );
      res.status(200).json({commands: result.rows.map(publicDeviceCommandPayload)});
      return;
    }

    const commands = deviceControlCommands
      .filter((command) => command.deviceId === device.id && command.status === 'queued')
      .slice(-limit)
      .reverse()
      .map(publicDeviceCommandPayload);
    res.status(200).json({commands});
  } catch (error) {
    res.status(500).json({error: error.message, commands: []});
  }
});

app.post('/api/device-commands/:commandId/ack', async (req, res) => {
  try {
    const isAuthorized = await validateIngestToken(req, 'command:ack');
    if (!isAuthorized) {
      res.status(401).json({error: 'invalid ingest token'});
      return;
    }

    const payload = req.body || {};
    const status = ['success', 'failed', 'sent'].includes(payload.status) ? payload.status : 'success';
    const result = payload.result || payload.message || `Device ACK: ${status}`;
    const command = await updateDeviceControlCommand(req.params.commandId, {status, result});

    if (!command) {
      res.status(404).json({error: 'command not found'});
      return;
    }

    res.status(200).json({command});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/device-commands', async (req, res) => {
  try {
    const payload = req.body || {};
    const allowedRoles = new Set(['Owner', 'Admin', 'Engineer', 'Operator']);
    const requestedByRole = String(payload.requestedByRole || '');

    if (requestedByRole === 'Demo') {
      res.status(403).json({error: 'demo account commands are frontend-only and cannot affect devices'});
      return;
    }

    if (!allowedRoles.has(requestedByRole)) {
      res.status(403).json({error: 'current user role is not allowed to issue control commands'});
      return;
    }

    const command = await createDeviceControlCommand({
      deviceId: payload.deviceId,
      command: payload.command,
      parameters: payload.parameters || {},
      requestedBy: payload.requestedBy || 'Unknown user',
      requestedByRole,
      source: 'control-center',
    });

    res.status(command.status === 'rejected' ? 404 : 202).json({command});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/notification-channels/test', async (req, res) => {
  try {
    const channel = req.body?.channel;
    if (!channel || typeof channel !== 'object') {
      res.status(400).json({ok: false, message: 'Notification channel payload is required.'});
      return;
    }

    const result = await testNotificationChannel(channel);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ok: false, message: error.message});
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    const state = await getAppState('dashboard_state');
    res.status(200).json({state});
  } catch (error) {
    res.status(500).json({error: error.message, state: null});
  }
});

app.put('/api/state', async (req, res) => {
  try {
    const incomingState = req.body || {};
    const currentState = await getDashboardState();
    if (Array.isArray(incomingState.accessCredentials) && Array.isArray(currentState.accessCredentials)) {
      const currentById = new Map(currentState.accessCredentials.map((credential) => [credential.id, credential]));
      incomingState.accessCredentials = incomingState.accessCredentials.map((credential) => {
        const current = currentById.get(credential.id);
        if (!current) return credential;
        const currentUsedCount = Number(current.usedCount || 0);
        const incomingUsedCount = Number(credential.usedCount || 0);
        return {
          ...credential,
          token: current.token,
          tokenHash: current.tokenHash,
          latestToken: current.latestToken,
          lastRotatedAt: current.lastRotatedAt || credential.lastRotatedAt,
          usedCount: Math.max(currentUsedCount, incomingUsedCount),
          lastUsedAt: current.lastUsedAt || credential.lastUsedAt,
        };
      });
    }
    await setAppState('dashboard_state', incomingState);
    res.status(200).json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/workflow-webhooks/:workflowId/:token', async (req, res) => {
  try {
    const {workflowId, token} = req.params;
    const payload = req.body || {};
    const event = {
      type: 'webhook',
      source: 'webhook',
      workflowId,
      token,
      payload,
      headers: req.headers,
      receivedAt: new Date().toISOString(),
    };

    if (db) {
      await queryDb(
        `INSERT INTO workflow_webhook_events (workflow_id, token, payload, headers)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
        [workflowId, token, JSON.stringify(payload), JSON.stringify(req.headers)]
      );
    }

    const workflows = await getDashboardWorkflows();
    const targetWorkflow = workflows.find((workflow) => workflow.id === workflowId);
    if (targetWorkflow?.enabled) {
      const trigger = targetWorkflow.nodes.find((node) => node.type === 'trigger' && triggerMatchesEvent(node, event));
      if (trigger) await executeWorkflow(targetWorkflow, trigger, event);
    }

    res.status(202).json({accepted: true, workflowId});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/workflow-runs', async (req, res) => {
  try {
    const workflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : '';
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));

    if (db) {
      const result = workflowId
        ? await queryDb(
          `SELECT id, workflow_id AS "workflowId", workflow_name AS "workflowName", trigger_type AS "triggerType",
                  event_source AS "eventSource", status, event, steps, started_at AS "startedAt", finished_at AS "finishedAt"
           FROM workflow_runs
           WHERE workflow_id = $1
           ORDER BY started_at DESC
           LIMIT $2`,
          [workflowId, limit]
        )
        : await queryDb(
          `SELECT id, workflow_id AS "workflowId", workflow_name AS "workflowName", trigger_type AS "triggerType",
                  event_source AS "eventSource", status, event, steps, started_at AS "startedAt", finished_at AS "finishedAt"
           FROM workflow_runs
           ORDER BY started_at DESC
           LIMIT $1`,
          [limit]
        );
      res.status(200).json({runs: result.rows});
      return;
    }

    const runs = workflowRuns
      .filter((run) => !workflowId || run.workflowId === workflowId)
      .slice(0, limit);
    res.status(200).json({runs});
  } catch (error) {
    res.status(500).json({error: error.message, runs: []});
  }
});

app.get('/api/workflow-live/:workflowId', async (req, res) => {
  try {
    const state = workflowLiveStates.get(req.params.workflowId);
    if (!state) {
      res.status(200).json({live: null});
      return;
    }

    const lastTouched = Date.parse(state.updatedAt || state.finishedAt || state.startedAt || '');
    const age = Number.isFinite(lastTouched) ? Date.now() - lastTouched : 0;
    if (state.status !== 'running' && age > 30000) {
      workflowLiveStates.delete(req.params.workflowId);
      res.status(200).json({live: null});
      return;
    }

    res.status(200).json({live: state});
  } catch (error) {
    res.status(500).json({error: error.message, live: null});
  }
});

app.get('/q/:token', async (req, res) => {
  try {
    const now = new Date();
    const {accesses, accessCredentials} = await getAccessState();
    const credential = accessCredentials.find((item) => item.latestToken === req.params.token && item.type === 'qr');
    const access = credential ? accesses.find((item) => item.id === credential.accessId) : null;
    const sendPage = (title, body) => {
      res.status(200).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f1115;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{max-width:420px;width:calc(100% - 32px);background:#1c2128;border:1px solid #273244;border-radius:12px;padding:24px;text-align:center}.qr{background:#fff;border-radius:8px;padding:10px;width:220px;height:220px}.link{word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#cbd5e1}.muted{color:#94a3b8;font-size:13px}</style></head><body><main class="card">${body}</main></body></html>`);
    };

    if (!credential || !access) {
      sendPage('QR unavailable', '<h1>QR unavailable</h1><p class="muted">This latest QR link was not found.</p>');
      return;
    }
    if (credential.maxUses <= 1 || !canUseLatestQrLink(credential)) {
      sendPage('QR unavailable', '<h1>QR unavailable</h1><p class="muted">One-time QR credentials do not expose a latest QR link.</p>');
      return;
    }
    if (access.enabled === false || credential.enabled === false) {
      sendPage('QR disabled', '<h1>QR disabled</h1><p class="muted">This access or QR credential is disabled.</p>');
      return;
    }
    if (credential.validUntil && now > new Date(credential.validUntil)) {
      sendPage('QR expired', '<h1>QR expired</h1><p class="muted">This QR credential has expired.</p>');
      return;
    }

    const rotated = rotateCredentialIfNeeded(credential, now);
    if (rotated.rotated) {
      const nextCredentials = accessCredentials.map((item) => item.id === credential.id ? rotated.credential : item);
      await patchAccessState({accesses, accessCredentials: nextCredentials});
    }

    const accessLink = createAccessLink(req, rotated.credential.token);
    const expiresAt = rotated.credential.validUntil ? new Date(rotated.credential.validUntil).toLocaleString() : 'No expiry';
    sendPage('Latest QR Code', `<h1>${rotated.credential.name || 'Latest QR Code'}</h1><p class="muted">Scan this QR code. It refreshes every ${rotated.credential.refreshIntervalSeconds}s.</p><img class="qr" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(accessLink)}" alt="Latest QR"><p class="link">${accessLink}</p><p class="muted">Usage this period: ${rotated.credential.usedCount || 0}/${rotated.credential.maxUses || 1}<br>Valid until: ${expiresAt}</p>`);
  } catch (error) {
    res.status(500).send(`<!doctype html><html><head><title>QR error</title></head><body><h1>QR error</h1><p>${error.message}</p></body></html>`);
  }
});

app.get('/a/:token', async (req, res) => {
  const now = new Date();
  const requestMeta = {
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
    method: 'GET',
    path: req.path,
  };

  try {
    const tokenHash = hashToken(req.params.token);
    const {accesses, accessCredentials} = await getAccessState();
    const credential = accessCredentials.find((item) => item.tokenHash === tokenHash && item.type === 'qr');
    const access = credential ? accesses.find((item) => item.id === credential.accessId) : null;
    const renderAccessPage = (statusCode, title, heading, message, detail = '') => {
      res.status(statusCode).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f1115;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{max-width:420px;width:calc(100% - 32px);background:#1c2128;border:1px solid #273244;border-radius:12px;padding:24px;text-align:center}.ok{color:#34d399}.denied{color:#fb7185}.muted{color:#94a3b8;font-size:13px;line-height:1.5}.message{font-size:18px;line-height:1.5;white-space:pre-wrap}</style></head><body><main class="card"><h1 class="${statusCode < 400 ? 'ok' : 'denied'}">${escapeHtml(heading)}</h1><p class="message">${escapeHtml(message)}</p>${detail ? `<p class="muted">${escapeHtml(detail)}</p>` : ''}</main></body></html>`);
    };
    const reject = async (statusCode, reason) => {
      await persistAccessEvent({
        id: createId('access-event'),
        accessId: access?.id || credential?.accessId || null,
        credentialId: credential?.id || null,
        credentialType: credential?.type || 'qr',
        status: 'rejected',
        reason,
        params: access?.extraParams || {},
        request: requestMeta,
        createdAt: now.toISOString(),
      });
      const deniedMessage = access?.deniedMessage || 'Access denied.';
      renderAccessPage(statusCode, 'Access denied', 'Access denied', deniedMessage, reason);
    };

    if (!credential) {
      await reject(404, 'QR code was not found.');
      return;
    }
    if (!access || access.enabled === false) {
      await reject(403, 'Access is disabled.');
      return;
    }
    if (credential.enabled === false) {
      await reject(403, 'QR code is disabled.');
      return;
    }
    if (credential.validFrom && now < new Date(credential.validFrom)) {
      await reject(403, 'QR code is not active yet.');
      return;
    }
    if (credential.validUntil && now > new Date(credential.validUntil)) {
      await reject(410, 'QR code has expired.');
      return;
    }
    if (Number(credential.usedCount || 0) >= Number(credential.maxUses || 1)) {
      await reject(429, 'QR code usage limit has been reached.');
      return;
    }

    const acceptedAt = now.toISOString();
    const nextCredentials = accessCredentials.map((item) => (
      item.id === credential.id
        ? {...item, usedCount: Number(item.usedCount || 0) + 1, lastUsedAt: acceptedAt}
        : item
    ));
    await patchAccessState({accesses, accessCredentials: nextCredentials});

    const accessEvent = {
      id: createId('access-event'),
      accessId: access.id,
      credentialId: credential.id,
      credentialType: credential.type || 'qr',
      status: 'accepted',
      reason: 'Access accepted',
      params: access.extraParams || {},
      request: requestMeta,
      createdAt: acceptedAt,
    };
    await persistAccessEvent(accessEvent);

    await dispatchWorkflowEvent({
      type: 'access',
      source: 'qr',
      accessId: access.id,
      accessName: access.name,
      credentialId: credential.id,
      credentialName: credential.name,
      params: access.extraParams || {},
      request: requestMeta,
      accessEvent,
      receivedAt: acceptedAt,
    });

    renderAccessPage(202, 'Access accepted', 'Access accepted', access.grantedMessage || 'Access granted.', access.name);
  } catch (error) {
    res.status(500).send(`<!doctype html><html><head><title>Access error</title></head><body><h1>Access error</h1><p>${escapeHtml(error.message)}</p></body></html>`);
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const startServer = async () => {
  try {
    await initDatabase();
  } catch (error) {
    console.error('Database initialization failed:', error);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`AI IoT Dashboard is running on port ${port}`);
    startMqttSubscribers();
    runScheduledWorkflows().catch((error) => console.error('Workflow scheduler failed:', error));
    setInterval(() => {
      runScheduledWorkflows().catch((error) => console.error('Workflow scheduler failed:', error));
    }, 30000);
  });
};

startServer();
