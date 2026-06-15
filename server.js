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
app.set('trust proxy', 1);
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
const workflowTriggerLastRuns = new Map();
const workflowAlertLastSent = new Map();
const securityAlertLastSent = new Map();
const deviceControlCommands = [];
const accessEvents = [];
const systemNotifications = [];
const partnerBillingWebhookLogs = [];
const auditLogs = [];
let revokedRefreshTokens = [];
let authLoginSecurityState = {};
const realtimeClients = new Set();
const maxTelemetryMessages = Number(process.env.IOT_TELEMETRY_BUFFER_SIZE || 500);
const maxWorkflowRuns = Number(process.env.WORKFLOW_RUN_BUFFER_SIZE || 500);
const maxDeviceControlCommands = Number(process.env.DEVICE_CONTROL_BUFFER_SIZE || 500);
const maxAccessEvents = Number(process.env.ACCESS_EVENT_BUFFER_SIZE || 500);
const maxSystemNotifications = Number(process.env.SYSTEM_NOTIFICATION_BUFFER_SIZE || 500);
const maxPartnerBillingWebhookLogs = Number(process.env.PARTNER_BILLING_WEBHOOK_LOG_BUFFER_SIZE || 500);
const maxAuditLogs = Number(process.env.AUDIT_LOG_BUFFER_SIZE || 1000);
const aiCopilotProvider = String(process.env.AI_COPILOT_PROVIDER || '').trim().toLowerCase();
const aiCopilotApiKey = String(process.env.AI_COPILOT_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
const aiCopilotModel = String(process.env.AI_COPILOT_MODEL || (aiCopilotProvider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini')).trim();
const aiCopilotBaseUrl = String(process.env.AI_COPILOT_BASE_URL || '').trim().replace(/\/+$/, '');
const workflowQueueMode = String(process.env.WORKFLOW_QUEUE_MODE || 'memory').trim().toLowerCase();
const workflowQueueConcurrency = Math.max(1, Math.min(Number(process.env.WORKFLOW_QUEUE_CONCURRENCY || 2), 20));
const workflowQueueMaxPending = Math.max(50, Number(process.env.WORKFLOW_QUEUE_MAX_PENDING || 1000));
const workflowQueuePollMs = Math.max(25, Number(process.env.WORKFLOW_QUEUE_POLL_MS || 100));
const workflowQueueStaleMs = Math.max(60000, Number(process.env.WORKFLOW_QUEUE_STALE_MS || 10 * 60 * 1000));
const workflowQueueMaxAttempts = Math.max(1, Number(process.env.WORKFLOW_QUEUE_MAX_ATTEMPTS || 3));
const telemetryRetentionEnabled = process.env.TELEMETRY_RETENTION_ENABLED !== 'false';
const telemetryRawRetentionDays = Math.max(1, Number(process.env.TELEMETRY_RAW_RETENTION_DAYS || 90));
const telemetryMinuteRollupRetentionDays = Math.max(1, Number(process.env.TELEMETRY_MINUTE_ROLLUP_RETENTION_DAYS || 30));
const telemetryHourRollupRetentionDays = Math.max(1, Number(process.env.TELEMETRY_HOUR_ROLLUP_RETENTION_DAYS || 730));
const telemetryRetentionIntervalMs = Math.max(5 * 60 * 1000, Number(process.env.TELEMETRY_RETENTION_INTERVAL_MS || 60 * 60 * 1000));
const timescaleEnabled = process.env.TIMESCALEDB_ENABLED === 'true';
const timescaleCompressionEnabled = process.env.TIMESCALEDB_COMPRESSION_ENABLED !== 'false';
const timescaleRawCompressionAfterDays = Math.max(1, Number(process.env.TIMESCALEDB_RAW_COMPRESSION_AFTER_DAYS || 7));
const timescaleRollupCompressionAfterDays = Math.max(1, Number(process.env.TIMESCALEDB_ROLLUP_COMPRESSION_AFTER_DAYS || 30));
const billingWebhookToken = String(process.env.BILLING_WEBHOOK_TOKEN || '').trim();
const authFailedLoginWindowMs = Math.max(60000, Number(process.env.AUTH_FAILED_LOGIN_WINDOW_MS || 10 * 60 * 1000));
const authFailedLoginMaxAttempts = Math.max(1, Number(process.env.AUTH_FAILED_LOGIN_MAX_ATTEMPTS || 5));
const authFailedLoginLockMs = Math.max(60000, Number(process.env.AUTH_FAILED_LOGIN_LOCK_MS || 15 * 60 * 1000));
const authPasswordMinLength = Math.max(8, Number(process.env.AUTH_PASSWORD_MIN_LENGTH || 10));
const authPasswordRequiredClasses = Math.max(1, Math.min(Number(process.env.AUTH_PASSWORD_REQUIRED_CLASSES || 3), 4));
const securityAlertCooldownMs = Math.max(0, Number(process.env.SECURITY_ALERT_COOLDOWN_MS || 5 * 60 * 1000));
const authLoginFailures = new Map();
const splitTopics = (value) => Array.isArray(value)
  ? value.map((topic) => String(topic).trim()).filter(Boolean)
  : String(value || '').split(',').map((topic) => topic.trim()).filter(Boolean);
const splitList = (value) => Array.isArray(value)
  ? value.map((item) => String(item).trim()).filter(Boolean)
  : String(value || '').split(/[,\n\r]+/).map((item) => item.trim()).filter(Boolean);
const authIpBlacklist = splitList(process.env.AUTH_IP_BLACKLIST || '');
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const authSessionSecret = process.env.AUTH_SESSION_SECRET || process.env.JWT_SECRET || 'dev-session-secret-change-me';
const authSessionTtlSeconds = Math.max(300, Number(process.env.AUTH_SESSION_TTL_SECONDS || 43200));
const authSessionCookieName = process.env.AUTH_SESSION_COOKIE_NAME || 'ai_iot_session';
const authRefreshTtlSeconds = Math.max(authSessionTtlSeconds, Number(process.env.AUTH_REFRESH_TTL_SECONDS || 14 * 24 * 60 * 60));
const authRefreshCookieName = process.env.AUTH_REFRESH_COOKIE_NAME || 'ai_iot_refresh';
const defaultAuthUsers = [
  {
    id: '1',
    name: 'Admin User',
    email: 'admin@factory.com',
    role: 'Admin',
    appProfile: 'full',
    siteId: 'factory-a',
    password: 'password123',
    status: 'approved',
  },
  {
    id: 'demo-user',
    name: 'Demo User',
    email: 'demo@factory.com',
    role: 'Demo',
    appProfile: 'full',
    siteId: 'factory-a',
    password: 'demo123',
    status: 'approved',
  },
];

const createPasswordHash = (password) => {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('base64url');
  return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password, user) => {
  const passwordHash = String(user?.passwordHash || '');
  if (passwordHash.startsWith('scrypt$')) {
    const [, salt, expectedHash] = passwordHash.split('$');
    if (!salt || !expectedHash) return false;
    const actualHash = crypto.scryptSync(String(password), salt, 64).toString('base64url');
    const expectedBuffer = Buffer.from(expectedHash);
    const actualBuffer = Buffer.from(actualHash);
    return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }
  return Boolean(user?.password) && user.password === password;
};

const commonWeakPasswords = new Set([
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

const validatePasswordPolicy = (password, identity = '') => {
  const value = String(password || '');
  const normalized = value.toLowerCase();
  const identityParts = String(identity || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 4);

  if (value.length < authPasswordMinLength) {
    return {ok: false, message: `Password must be at least ${authPasswordMinLength} characters.`};
  }
  if (commonWeakPasswords.has(normalized)) {
    return {ok: false, message: 'Password is too common. Please choose a stronger password.'};
  }
  if (identityParts.some((part) => normalized.includes(part))) {
    return {ok: false, message: 'Password should not contain your name or email.'};
  }

  const classCount = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length;

  if (classCount < authPasswordRequiredClasses) {
    return {ok: false, message: `Password must include at least ${authPasswordRequiredClasses} of: uppercase, lowercase, number, symbol.`};
  }
  return {ok: true, message: 'Password meets the security policy.'};
};

const sanitizeUserForStorage = (user) => {
  const nextUser = {...user};
  if (typeof nextUser.password === 'string' && nextUser.password.length > 0) {
    nextUser.passwordHash = createPasswordHash(nextUser.password);
  }
  delete nextUser.password;
  return nextUser;
};

const sanitizeUsersForStorage = (users = []) => users.map(sanitizeUserForStorage);

const getRequestIp = (req) => {
  const forwardedFor = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
};

const normalizedIp = (value) => String(value || '').trim().replace(/^::ffff:/, '');

const ipMatchesRule = (ip, rule) => {
  const normalizedRule = normalizedIp(rule);
  const normalizedRequestIp = normalizedIp(ip);
  if (!normalizedRule) return false;
  if (normalizedRule === '*' || normalizedRule === normalizedRequestIp) return true;
  if (normalizedRule.endsWith('.*')) return normalizedRequestIp.startsWith(normalizedRule.slice(0, -1));
  return false;
};

const getSecuritySettings = async () => {
  const state = await getDashboardState();
  return state.securitySettings || {};
};

const isRequestIpBlocked = async (req) => {
  const ip = getRequestIp(req);
  const settings = await getSecuritySettings();
  const rules = [
    ...authIpBlacklist,
    ...splitList(settings.ipBlacklist || ''),
  ];
  return {
    blocked: rules.some((rule) => ipMatchesRule(ip, rule)),
    ip,
  };
};

const rejectBlockedIp = async (req, res, actionLabel = 'this action') => {
  const result = await isRequestIpBlocked(req);
  if (!result.blocked) return false;
  await writeAuditLog(req, {id: null, name: result.ip, role: null}, 'auth.ip_blocked', 'ip', result.ip, 'failed', {actionLabel});
  await dispatchSecurityAlert('ip_blocked', {
    ip: result.ip,
    level: 'Critical',
    message: `Blocked IP ${result.ip} attempted to perform ${actionLabel}.`,
  });
  res.status(403).json({ok: false, message: 'This IP address is blocked by security policy.'});
  return true;
};

const getLoginRateLimitKey = (req, email) => `${getRequestIp(req)}:${String(email || '').toLowerCase()}`;

const getLoginRateLimitState = (req, email) => {
  const key = getLoginRateLimitKey(req, email);
  const now = Date.now();
  const current = authLoginFailures.get(key);
  if (!current) return {key, limited: false, retryAfterSeconds: 0};
  if (current.lockedUntil && current.lockedUntil > now) {
    return {key, limited: true, retryAfterSeconds: Math.ceil((current.lockedUntil - now) / 1000)};
  }
  if (current.firstFailedAt && now - current.firstFailedAt > authFailedLoginWindowMs) {
    authLoginFailures.delete(key);
    return {key, limited: false, retryAfterSeconds: 0};
  }
  return {key, limited: false, retryAfterSeconds: 0};
};

const recordLoginFailure = (key) => {
  const now = Date.now();
  const current = authLoginFailures.get(key);
  const next = current && now - current.firstFailedAt <= authFailedLoginWindowMs
    ? {...current, count: current.count + 1, lastFailedAt: now}
    : {count: 1, firstFailedAt: now, lastFailedAt: now, lockedUntil: null};
  if (next.count >= authFailedLoginMaxAttempts) {
    next.lockedUntil = now + authFailedLoginLockMs;
  }
  authLoginFailures.set(key, next);
  return next;
};

const clearLoginFailures = (key) => {
  authLoginFailures.delete(key);
};

const recordSuccessfulLoginSecurityState = async (req, user) => {
  if (!user?.id) return;
  const ip = getRequestIp(req);
  const userAgent = req.get('user-agent') || '';
  const state = db ? await getAppState('auth_login_security_state') : null;
  const currentState = db
    ? (state && typeof state === 'object' ? state : {})
    : authLoginSecurityState;
  const previous = currentState[user.id] || null;
  const changedIp = previous?.lastIp && previous.lastIp !== ip;
  const nextState = {
    ...currentState,
    [user.id]: {
      lastIp: ip,
      lastUserAgent: userAgent,
      lastLoginAt: new Date().toISOString(),
      previousIp: previous?.lastIp || '',
    },
  };
  if (db) await setAppState('auth_login_security_state', nextState);
  else authLoginSecurityState = nextState;

  const settings = await getSecuritySettings();
  if (changedIp && settings.unusualLoginAlertsEnabled !== false) {
    await writeAuditLog(req, publicAuthUser(user), 'auth.login_unusual_ip', 'user', user.id, 'success', {
      previousIp: previous.lastIp,
      currentIp: ip,
      previousLoginAt: previous.lastLoginAt,
    });
    await dispatchSecurityAlert('unusual_login', {
      email: user.email,
      ip,
      previousIp: previous.lastIp,
      message: `User ${user.email || user.name || user.id} signed in from a new IP ${ip}. Previous IP: ${previous.lastIp}.`,
    });
  }
};

const writeAuditLog = async (req, actor, action, targetType, targetId, result = 'success', details = {}) => {
  const log = {
    id: createId('audit'),
    actorId: actor?.id || null,
    actorName: actor?.name || null,
    actorRole: actor?.role || null,
    action,
    targetType: targetType || null,
    targetId: targetId || null,
    result,
    ip: req ? getRequestIp(req) : null,
    userAgent: req?.get?.('user-agent') || null,
    details: details && typeof details === 'object' ? details : {},
    createdAt: new Date().toISOString(),
  };

  auditLogs.unshift(log);
  if (auditLogs.length > maxAuditLogs) {
    auditLogs.splice(maxAuditLogs);
  }

  if (db) {
    await queryDb(
      `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, target_type, target_id, result, ip, user_agent, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::timestamptz)`,
      [
        log.id,
        log.actorId,
        log.actorName,
        log.actorRole,
        log.action,
        log.targetType,
        log.targetId,
        log.result,
        log.ip,
        log.userAgent,
        JSON.stringify(log.details),
        log.createdAt,
      ]
    );
  }

  return log;
};

const isHex = (value, length = null) => {
  const text = String(value || '').trim();
  return /^[0-9a-f]+$/i.test(text) && (length === null || text.length === length);
};
const normalizeHex = (value) => String(value || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

const aesEncryptBlock = (key, block) => {
  const cipher = crypto.createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
};

const xorBuffers = (first, second) => Buffer.from(first.map((byte, index) => byte ^ second[index]));
const leftShiftOneBit = (input) => {
  const output = Buffer.alloc(input.length);
  let carry = 0;
  for (let index = input.length - 1; index >= 0; index--) {
    const byte = input[index];
    output[index] = ((byte << 1) & 0xff) | carry;
    carry = (byte & 0x80) ? 1 : 0;
  }
  return output;
};
const generateCmacSubkeys = (key) => {
  const zero = Buffer.alloc(16, 0);
  const l = aesEncryptBlock(key, zero);
  const k1 = leftShiftOneBit(l);
  if (l[0] & 0x80) k1[15] ^= 0x87;
  const k2 = leftShiftOneBit(k1);
  if (k1[0] & 0x80) k2[15] ^= 0x87;
  return {k1, k2};
};
const aesCmac = (key, message) => {
  const {k1, k2} = generateCmacSubkeys(key);
  const blockCount = Math.max(1, Math.ceil(message.length / 16));
  const completeLastBlock = message.length > 0 && message.length % 16 === 0;
  const lastBlockStart = (blockCount - 1) * 16;
  let lastBlock;

  if (completeLastBlock) {
    lastBlock = xorBuffers(message.subarray(lastBlockStart, lastBlockStart + 16), k1);
  } else {
    const padded = Buffer.alloc(16, 0);
    message.subarray(lastBlockStart).copy(padded);
    padded[message.length - lastBlockStart] = 0x80;
    lastBlock = xorBuffers(padded, k2);
  }

  let x = Buffer.alloc(16, 0);
  for (let index = 0; index < blockCount - 1; index++) {
    const block = message.subarray(index * 16, index * 16 + 16);
    x = aesEncryptBlock(key, xorBuffers(x, block));
  }
  return aesEncryptBlock(key, xorBuffers(x, lastBlock));
};

const sendRealtimeEvent = (res, type, payload) => {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const broadcastRealtimeEvent = (type, payload) => {
  const eventPayload = {
    ...payload,
    type,
    emittedAt: new Date().toISOString(),
  };

  for (const client of realtimeClients) {
    try {
      sendRealtimeEvent(client, type, eventPayload);
    } catch {
      realtimeClients.delete(client);
    }
  }
};
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
let generatedReports = [];
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

const timescaleState = {
  enabled: timescaleEnabled,
  available: false,
  telemetryHypertable: false,
  rollupHypertable: false,
  compressionEnabled: timescaleCompressionEnabled,
  rawCompressionPolicy: false,
  rollupCompressionPolicy: false,
  lastRunAt: null,
  lastError: '',
  warnings: [],
};

const addTimescaleWarning = (message) => {
  const text = String(message || '').trim();
  if (!text) return;
  timescaleState.warnings = [...timescaleState.warnings.filter((item) => item !== text), text].slice(-8);
};

const runOptionalTimescaleStep = async (label, fn) => {
  try {
    await fn();
    return true;
  } catch (error) {
    const message = `${label}: ${error.message || error}`;
    addTimescaleWarning(message);
    console.warn(`TimescaleDB optional step skipped - ${message}`);
    return false;
  }
};

const getTimescaleStatus = async () => {
  if (!db || !timescaleEnabled) return {...timescaleState, databaseBacked: Boolean(db)};
  try {
    const result = await queryDb(`
      SELECT hypertable_name AS name
      FROM timescaledb_information.hypertables
      WHERE hypertable_name IN ('telemetry_messages', 'telemetry_metric_rollups')
    `);
    const names = new Set((result?.rows || []).map((row) => row.name));
    return {
      ...timescaleState,
      databaseBacked: true,
      telemetryHypertable: names.has('telemetry_messages') || timescaleState.telemetryHypertable,
      rollupHypertable: names.has('telemetry_metric_rollups') || timescaleState.rollupHypertable,
    };
  } catch {
    return {...timescaleState, databaseBacked: true};
  }
};

const configureTimescaleTelemetry = async () => {
  timescaleState.lastRunAt = new Date().toISOString();
  if (!db || !timescaleEnabled) return;

  const extensionReady = await runOptionalTimescaleStep('create timescaledb extension', async () => {
    await queryDb('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');
  });
  if (!extensionReady) {
    timescaleState.lastError = 'TimescaleDB extension is not available. PostgreSQL tables continue to work normally.';
    return;
  }

  timescaleState.available = true;
  timescaleState.lastError = '';

  await runOptionalTimescaleStep('prepare telemetry_messages unique index', async () => {
    await queryDb('ALTER TABLE telemetry_messages DROP CONSTRAINT IF EXISTS telemetry_messages_pkey');
    await queryDb('CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_messages_id_received_unique ON telemetry_messages (id, received_at)');
  });

  timescaleState.telemetryHypertable = await runOptionalTimescaleStep('create telemetry_messages hypertable', async () => {
    await queryDb("SELECT create_hypertable('telemetry_messages', 'received_at', if_not_exists => TRUE, migrate_data => TRUE)");
  });

  timescaleState.rollupHypertable = await runOptionalTimescaleStep('create telemetry_metric_rollups hypertable', async () => {
    await queryDb("SELECT create_hypertable('telemetry_metric_rollups', 'bucket_start', if_not_exists => TRUE, migrate_data => TRUE)");
  });

  if (!timescaleCompressionEnabled) return;

  timescaleState.rawCompressionPolicy = await runOptionalTimescaleStep('enable telemetry_messages compression policy', async () => {
    await queryDb("ALTER TABLE telemetry_messages SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id,source', timescaledb.compress_orderby = 'received_at DESC')");
    await queryDb(
      "SELECT add_compression_policy('telemetry_messages', ($1::text || ' days')::interval, if_not_exists => TRUE)",
      [timescaleRawCompressionAfterDays]
    );
  });

  timescaleState.rollupCompressionPolicy = await runOptionalTimescaleStep('enable telemetry_metric_rollups compression policy', async () => {
    await queryDb("ALTER TABLE telemetry_metric_rollups SET (timescaledb.compress, timescaledb.compress_segmentby = 'bucket_interval,device_id,metric,source', timescaledb.compress_orderby = 'bucket_start DESC')");
    await queryDb(
      "SELECT add_compression_policy('telemetry_metric_rollups', ($1::text || ' days')::interval, if_not_exists => TRUE)",
      [timescaleRollupCompressionAfterDays]
    );
  });
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
    CREATE TABLE IF NOT EXISTS telemetry_metric_rollups (
      bucket_interval text NOT NULL,
      bucket_start timestamptz NOT NULL,
      device_id text NOT NULL,
      site_id text,
      metric text NOT NULL,
      source text NOT NULL,
      count integer NOT NULL DEFAULT 0,
      min_value double precision NOT NULL,
      max_value double precision NOT NULL,
      sum_value double precision NOT NULL,
      latest_value double precision NOT NULL,
      last_received_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (bucket_interval, bucket_start, device_id, metric, source)
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
      workflow_version integer NOT NULL DEFAULT 1,
      trigger_type text NOT NULL,
      event_source text NOT NULL,
      status text NOT NULL,
      event jsonb NOT NULL,
      steps jsonb NOT NULL,
      started_at timestamptz NOT NULL,
      finished_at timestamptz NOT NULL
    )
  `);
  await queryDb('ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS workflow_version integer NOT NULL DEFAULT 1');
  await queryDb(`
    CREATE TABLE IF NOT EXISTS workflow_queue_jobs (
      id text PRIMARY KEY,
      workflow_id text NOT NULL,
      workflow_name text,
      trigger_id text NOT NULL,
      reason text,
      status text NOT NULL,
      workflow jsonb NOT NULL,
      trigger jsonb NOT NULL,
      event jsonb NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      locked_by text,
      locked_at timestamptz,
      enqueued_at timestamptz NOT NULL,
      started_at timestamptz,
      finished_at timestamptz,
      updated_at timestamptz NOT NULL,
      last_error text
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
  await queryDb(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id text PRIMARY KEY,
      actor_id text,
      actor_name text,
      actor_role text,
      action text NOT NULL,
      target_type text,
      target_id text,
      result text NOT NULL,
      ip text,
      user_agent text,
      details jsonb NOT NULL,
      created_at timestamptz NOT NULL
    )
  `);
  await queryDb('CREATE INDEX IF NOT EXISTS idx_telemetry_device_received ON telemetry_messages (device_id, received_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_telemetry_received ON telemetry_messages (received_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_telemetry_rollups_lookup ON telemetry_metric_rollups (bucket_interval, device_id, metric, bucket_start ASC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_telemetry_rollups_site_lookup ON telemetry_metric_rollups (bucket_interval, site_id, metric, bucket_start ASC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_workflow_webhook_events_received ON workflow_webhook_events (workflow_id, received_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started ON workflow_runs (workflow_id, started_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_workflow_queue_status_enqueued ON workflow_queue_jobs (status, enqueued_at ASC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_workflow_queue_locked ON workflow_queue_jobs (status, locked_at ASC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_device_control_commands_created ON device_control_commands (created_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_access_events_created ON access_events (created_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action, created_at DESC)');
  await configureTimescaleTelemetry();

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
  siteIds: splitList(channel.siteIds),
  deviceIds: splitList(channel.deviceIds),
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
  siteIds: splitList(channel.siteIds),
  deviceIds: splitList(channel.deviceIds),
});

const publicMqttChannel = (channel) => ({
  id: channel.id,
  name: channel.name,
  enabled: channel.enabled,
  brokerUrl: channel.brokerUrl,
  username: channel.username,
  topics: channel.topics,
  siteIds: splitList(channel.siteIds),
  deviceIds: splitList(channel.deviceIds),
});

const createIngestToken = () => `iot_${crypto.randomBytes(24).toString('hex')}`;

const normalizeIngestTokenScopes = (value) => splitList(value);
const normalizeIngestTokenTargets = (value) => splitList(value);

const publicIngestToken = (token) => ({
  id: token.id,
  name: token.name,
  token: token.token,
  ownerUserId: token.ownerUserId,
  ownerName: token.ownerName,
  scopes: normalizeIngestTokenScopes(token.scopes),
  siteIds: normalizeIngestTokenTargets(token.siteIds),
  deviceIds: normalizeIngestTokenTargets(token.deviceIds),
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

const decodeHeaderValue = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const encodeSessionPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const signSessionBody = (body) => crypto.createHmac('sha256', authSessionSecret).update(body).digest('base64url');

const publicAuthUser = (user) => user ? {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  appProfile: user.appProfile,
  featureAccess: user.featureAccess,
  controlAccess: user.controlAccess,
  dataAccess: user.dataAccess,
  siteId: user.siteId,
  customerId: user.customerId,
  status: user.status,
  createdAt: user.createdAt,
  approvedAt: user.approvedAt,
} : null;

const mergeDefaultAuthUsers = (users = []) => {
  const existingEmails = new Set(users.map((user) => String(user.email || '').toLowerCase()));
  return [
    ...users,
    ...defaultAuthUsers.filter((user) => !existingEmails.has(user.email.toLowerCase())),
  ];
};

const getAuthUsers = async () => {
  const state = await getDashboardState();
  return mergeDefaultAuthUsers(Array.isArray(state.users) ? state.users : []);
};

const createAuthToken = (user, ttlSeconds, tokenType) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    jti: createId(tokenType === 'AI-IOT-REFRESH' ? 'refresh' : 'session'),
    iat: now,
    exp: now + ttlSeconds,
    type: tokenType,
  };
  const body = encodeSessionPart({alg: 'HS256', typ: tokenType}) + '.' + encodeSessionPart(payload);
  return `${body}.${signSessionBody(body)}`;
};

const createSessionToken = (user) => createAuthToken(user, authSessionTtlSeconds, 'AI-IOT-SESSION');
const createRefreshToken = (user) => createAuthToken(user, authRefreshTtlSeconds, 'AI-IOT-REFRESH');

const isSecureRequest = (req) => req?.secure || String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim() === 'https' || process.env.NODE_ENV === 'production';

const serializeAuthCookie = (req, name, token, maxAgeSeconds) => {
  const parts = [
    `${name}=${token || ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}`,
  ];
  if (!token) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
};

const setAuthCookies = (req, res, sessionToken, refreshToken = null) => {
  const cookies = [serializeAuthCookie(req, authSessionCookieName, sessionToken, authSessionTtlSeconds)];
  if (refreshToken) cookies.push(serializeAuthCookie(req, authRefreshCookieName, refreshToken, authRefreshTtlSeconds));
  res.setHeader('Set-Cookie', cookies);
};

const clearAuthCookies = (req, res) => {
  res.setHeader('Set-Cookie', [
    serializeAuthCookie(req, authSessionCookieName, '', 0),
    serializeAuthCookie(req, authRefreshCookieName, '', 0),
  ]);
};

const getCookieValue = (req, name) => {
  const cookieHeader = req.get('cookie') || '';
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex < 0) return ['', ''];
      return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)];
    })
    .find(([key]) => key === name)?.[1] || '';
};

const getSessionTokenFromRequest = (req) => {
  const explicit = req.get('x-iot-session-token');
  if (explicit) return explicit.trim();
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return getCookieValue(req, authSessionCookieName);
};

const getRefreshTokenFromRequest = (req) => {
  const explicit = req.get('x-iot-refresh-token');
  if (explicit) return explicit.trim();
  return getCookieValue(req, authRefreshCookieName);
};

const decodeAuthTokenPayload = (token, expectedType = 'AI-IOT-SESSION', allowExpired = false) => {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const body = `${header}.${payload}`;
  const expected = signSessionBody(body);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  let decodedPayload = null;
  try {
    decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  let decodedHeader = null;
  try {
    decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  } catch {
    decodedHeader = null;
  }
  if ((decodedPayload.type && decodedPayload.type !== expectedType) || (decodedHeader?.typ && decodedHeader.typ !== expectedType)) return null;
  if (!decodedPayload?.sub || (!allowExpired && Number(decodedPayload.exp || 0) < Math.floor(Date.now() / 1000))) return null;
  return decodedPayload;
};

const getRevokedRefreshTokens = async () => {
  const now = Math.floor(Date.now() / 1000);
  const saved = db ? await getAppState('revoked_refresh_tokens') : revokedRefreshTokens;
  const list = Array.isArray(saved) ? saved : [];
  const active = list.filter((item) => Number(item.expiresAt || 0) > now);
  if (active.length !== list.length) {
    await saveRevokedRefreshTokens(active);
  }
  return active;
};

const saveRevokedRefreshTokens = async (tokens) => {
  const nextTokens = Array.isArray(tokens) ? tokens.slice(-2000) : [];
  if (db) {
    await setAppState('revoked_refresh_tokens', nextTokens);
  } else {
    revokedRefreshTokens = nextTokens;
  }
  return nextTokens;
};

const isRefreshTokenRevoked = async (jti) => {
  if (!jti) return false;
  const revoked = await getRevokedRefreshTokens();
  return revoked.some((item) => item.jti === jti);
};

const revokeRefreshToken = async (token, reason = 'revoked') => {
  const payload = decodeAuthTokenPayload(token, 'AI-IOT-REFRESH', true);
  if (!payload?.jti) return false;
  const revoked = await getRevokedRefreshTokens();
  if (!revoked.some((item) => item.jti === payload.jti)) {
    await saveRevokedRefreshTokens([
      ...revoked,
      {
        jti: payload.jti,
        userId: payload.sub,
        reason,
        revokedAt: new Date().toISOString(),
        expiresAt: Number(payload.exp || 0),
      },
    ]);
  }
  return true;
};

const verifyAuthToken = async (token, expectedType = 'AI-IOT-SESSION') => {
  const decodedPayload = decodeAuthTokenPayload(token, expectedType);
  if (!decodedPayload) return null;
  if (expectedType === 'AI-IOT-REFRESH' && await isRefreshTokenRevoked(decodedPayload.jti)) return null;

  const users = await getAuthUsers();
  const user = users.find((item) => item.id === decodedPayload.sub && item.status === 'approved');
  return publicAuthUser(user);
};

const verifySessionToken = async (token) => verifyAuthToken(token, 'AI-IOT-SESSION');
const verifyRefreshToken = async (token) => verifyAuthToken(token, 'AI-IOT-REFRESH');

const getApiActor = async (req) => {
  const sessionUser = await verifySessionToken(getSessionTokenFromRequest(req));
  if (sessionUser) return sessionUser;
  return {
    id: '',
    name: decodeHeaderValue(req.get('x-iot-user-name')),
    role: '',
  };
};

const requireApiActorRole = async (req, res, allowedRoles, actionLabel = 'this action') => {
  if (await rejectBlockedIp(req, res, actionLabel)) return null;
  const actor = await getApiActor(req);
  if (!actor.id || !actor.role) {
    res.status(401).json({error: `login required to perform ${actionLabel}`});
    return null;
  }
  if (actor.role === 'Demo') {
    res.status(403).json({error: `demo account cannot perform ${actionLabel}`});
    return null;
  }
  if (!allowedRoles.includes(actor.role)) {
    res.status(403).json({error: `${actor.role || 'current user'} cannot perform ${actionLabel}`});
    return null;
  }
  return actor;
};

const ingestScopeMatches = (scope, source) => {
  const normalizedScope = String(scope || '').trim();
  const normalizedSource = String(source || '').trim();
  if (!normalizedScope || !normalizedSource) return false;
  if (normalizedScope === '*' || normalizedScope === normalizedSource) return true;
  if (normalizedScope.endsWith(':*')) {
    return normalizedSource.startsWith(normalizedScope.slice(0, -1));
  }
  if (normalizedScope === 'telemetry:write') {
    return normalizedSource.startsWith('http:') || normalizedSource.startsWith('mqtt:');
  }
  if (normalizedScope === 'command:gateway') {
    return normalizedSource.startsWith('command:');
  }
  return false;
};

const getIngestTokenContextsFromPayload = async (payload) => {
  const messages = Array.isArray(payload) ? payload : [payload];
  const contexts = [];

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const device = await findDashboardDeviceForTelemetry(message);
    const deviceId = message.device_id || message.deviceId || message.id || device?.config?.externalDeviceId || device?.id;
    contexts.push({
      deviceId: device?.id || deviceId || '',
      siteId: message.site_id || message.siteId || device?.siteId || '',
    });
  }

  return contexts.length > 0 ? contexts : [{}];
};

const enrichIngestTokenContext = async (context = {}) => {
  if (context.siteId || !context.deviceId) return context;
  const device = await findDashboardDevice(context.deviceId);
  return {
    ...context,
    deviceId: device?.id || context.deviceId,
    siteId: device?.siteId || context.siteId || '',
  };
};

const isIngestTokenAllowedForContext = async (token, source, contexts = [{}]) => {
  const scopes = normalizeIngestTokenScopes(token.scopes);
  if (scopes.length > 0 && !scopes.some((scope) => ingestScopeMatches(scope, source))) {
    return false;
  }

  const siteIds = normalizeIngestTokenTargets(token.siteIds);
  const deviceIds = normalizeIngestTokenTargets(token.deviceIds);
  if (siteIds.length === 0 && deviceIds.length === 0) return true;

  const enrichedContexts = await Promise.all((contexts.length > 0 ? contexts : [{}]).map(enrichIngestTokenContext));
  return enrichedContexts.every((context) => {
    const contextDeviceId = String(context.deviceId || '').trim();
    const contextSiteId = String(context.siteId || '').trim();
    const deviceAllowed = deviceIds.length === 0 || (contextDeviceId && deviceIds.includes(contextDeviceId));
    const siteAllowed = siteIds.length === 0 || (contextSiteId && siteIds.includes(contextSiteId));
    return deviceAllowed && siteAllowed;
  });
};

const validateIngestToken = async (req, source, contexts = [{}]) => {
  const activeTokens = ingestTokens.filter((token) => !token.revokedAt);
  if (activeTokens.length === 0) return true;

  const providedToken = getProvidedIngestToken(req);
  const matchedToken = activeTokens.find((token) => token.token === providedToken);
  if (!matchedToken) return false;

  const allowed = await isIngestTokenAllowedForContext(matchedToken, source, contexts);
  if (!allowed) return false;

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

const getPartnerBillingWebhookLogs = async () => {
  if (db) {
    const saved = await getAppState('partner_billing_webhook_logs');
    return Array.isArray(saved) ? saved : [];
  }
  return partnerBillingWebhookLogs;
};

const savePartnerBillingWebhookLogs = async (logs = []) => {
  const nextLogs = logs.slice(0, maxPartnerBillingWebhookLogs);
  if (db) {
    await setAppState('partner_billing_webhook_logs', nextLogs);
  } else {
    partnerBillingWebhookLogs.splice(0, partnerBillingWebhookLogs.length, ...nextLogs);
  }
  return nextLogs;
};

const summarizeBillingWebhookPayload = (payload = {}) => {
  try {
    const text = JSON.stringify(payload);
    return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
  } catch {
    return '[unserializable payload]';
  }
};

const sanitizeBillingWebhookPayload = (payload = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const sanitized = {...payload};
  for (const key of ['token', 'webhookToken', 'secret', 'signature']) {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) sanitized[key] = '[redacted]';
  }
  return sanitized;
};

const recordPartnerBillingWebhookLog = async (req, details = {}) => {
  const sanitizedPayload = details.payload ? sanitizeBillingWebhookPayload(details.payload) : null;
  const current = await getPartnerBillingWebhookLogs();
  const log = {
    id: createId('billing-webhook-log'),
    result: details.result || 'received',
    httpStatus: details.httpStatus || 200,
    message: details.message || '',
    invoiceId: details.invoiceId || details.event?.invoiceId || '',
    invoiceNo: details.invoiceNo || details.event?.invoiceNo || '',
    status: details.status || details.event?.status || '',
    externalStatus: details.externalStatus || details.event?.externalStatus || '',
    externalPaymentId: details.externalPaymentId || details.event?.externalPaymentId || '',
    provider: details.provider || details.event?.provider || '',
    event: details.event || null,
    payload: sanitizedPayload,
    payloadSummary: sanitizedPayload ? summarizeBillingWebhookPayload(sanitizedPayload) : '',
    replayedFromLogId: details.replayedFromLogId || '',
    ip: req ? getRequestIp(req) : null,
    userAgent: req?.get?.('user-agent') || null,
    createdAt: new Date().toISOString(),
  };
  await savePartnerBillingWebhookLogs([log, ...current]);
  return log;
};

const timingSafeEqualText = (first, second) => {
  const firstBuffer = Buffer.from(String(first || ''));
  const secondBuffer = Buffer.from(String(second || ''));
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
};

const getProvidedBillingWebhookToken = (req) => {
  const authorization = req.get('authorization') || '';
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return String(
    req.get('x-billing-webhook-token')
    || (bearerMatch ? bearerMatch[1] : '')
    || req.query.token
    || req.body?.token
    || ''
  ).trim();
};

const verifyBillingWebhookToken = (req, state = {}) => {
  const expectedToken = billingWebhookToken || String(state.partnerBillingIntegration?.webhookToken || '').trim();
  if (!expectedToken) {
    return {ok: false, status: 428, message: 'Billing webhook token is not configured.'};
  }
  const providedToken = getProvidedBillingWebhookToken(req);
  if (!providedToken || !timingSafeEqualText(providedToken, expectedToken)) {
    return {ok: false, status: 401, message: 'Invalid billing webhook token.'};
  }
  return {ok: true};
};

const normalizePartnerInvoiceStatus = (value, eventType = '') => {
  const text = String(value || eventType || '').trim().toLowerCase();
  if (['paid', 'succeeded', 'success', 'payment_succeeded', 'invoice.paid', 'checkout.session.completed', 'captured'].includes(text)) return 'paid';
  if (['open', 'pending', 'unpaid', 'invoice.created', 'invoice.finalized'].includes(text)) return 'open';
  if (['overdue', 'past_due', 'past-due'].includes(text)) return 'overdue';
  if (['void', 'voided', 'cancelled', 'canceled'].includes(text)) return 'void';
  if (['draft'].includes(text)) return 'draft';
  return '';
};

const readNested = (value, pathValue) => pathValue.split('.').reduce((current, key) => (
  current && typeof current === 'object' ? current[key] : undefined
), value);

const firstPayloadValue = (payload, paths) => {
  for (const pathValue of paths) {
    const value = readNested(payload, pathValue);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
};

const extractBillingWebhookEvent = (payload = {}) => {
  const object = payload.data?.object || payload.object || payload.invoice || payload.payment || payload;
  const metadata = object.metadata || payload.metadata || {};
  const invoiceNo = firstPayloadValue({payload, object, metadata}, [
    'payload.invoiceNo',
    'payload.invoice_no',
    'payload.invoiceNumber',
    'payload.invoice_number',
    'object.invoiceNo',
    'object.invoice_no',
    'object.number',
    'object.client_reference_id',
    'metadata.invoiceNo',
    'metadata.invoice_no',
    'metadata.invoiceNumber',
  ]);
  const invoiceId = firstPayloadValue({payload, object, metadata}, [
    'payload.invoiceId',
    'payload.invoice_id',
    'object.invoiceId',
    'object.invoice_id',
    'object.id',
    'metadata.invoiceId',
    'metadata.invoice_id',
  ]);
  const externalPaymentId = firstPayloadValue({payload, object}, [
    'payload.paymentId',
    'payload.payment_id',
    'payload.transactionId',
    'payload.transaction_id',
    'object.payment_intent',
    'object.paymentId',
    'object.payment_id',
    'object.id',
  ]);
  const rawStatus = firstPayloadValue({payload, object}, [
    'payload.status',
    'payload.payment_status',
    'payload.event',
    'payload.type',
    'object.status',
    'object.payment_status',
  ]);
  const eventType = String(payload.type || payload.event || '').trim();
  return {
    invoiceNo: String(invoiceNo || '').trim(),
    invoiceId: String(invoiceId || '').trim(),
    status: normalizePartnerInvoiceStatus(rawStatus, eventType),
    externalStatus: String(rawStatus || eventType || '').trim(),
    externalPaymentId: String(externalPaymentId || '').trim(),
    provider: String(payload.provider || payload.source || '').trim(),
    amount: Number(firstPayloadValue({payload, object}, ['payload.amount', 'payload.total', 'object.amount_total', 'object.amount_paid', 'object.total'])),
    currency: String(firstPayloadValue({payload, object}, ['payload.currency', 'object.currency']) || '').toUpperCase(),
  };
};

const processPartnerBillingWebhookPayload = async (req, payload = {}, options = {}) => {
  const state = await getDashboardState();
  const event = extractBillingWebhookEvent(payload);
  if (!event.status) {
    await recordPartnerBillingWebhookLog(req, {
      result: 'failed',
      httpStatus: 400,
      message: 'Unsupported or missing invoice status.',
      event,
      payload,
      replayedFromLogId: options.replayedFromLogId,
    });
    await writeAuditLog(req, {id: 'billing-webhook', name: 'Billing Webhook', role: 'External'}, 'partner_billing.webhook', 'partner_invoice', event.invoiceNo || event.invoiceId || '', 'failed', {
      reason: 'Unsupported or missing invoice status.',
      event,
      replayedFromLogId: options.replayedFromLogId,
    });
    return {httpStatus: 400, body: {ok: false, message: 'Unsupported or missing invoice status.', event}};
  }

  const partnerInvoices = Array.isArray(state.partnerInvoices) ? state.partnerInvoices : [];
  const invoiceIndex = partnerInvoices.findIndex((invoice) => (
    (event.invoiceNo && String(invoice.invoiceNo).toLowerCase() === event.invoiceNo.toLowerCase())
    || (event.invoiceId && String(invoice.id) === event.invoiceId)
    || (event.invoiceId && String(invoice.externalPaymentId || '') === event.invoiceId)
  ));

  if (invoiceIndex < 0) {
    const integration = {
      ...(state.partnerBillingIntegration || {}),
      lastSyncStatus: 'failed',
      lastSyncAt: new Date().toISOString(),
      lastSyncMessage: `Billing webhook invoice not found: ${event.invoiceNo || event.invoiceId || 'unknown'}.`,
    };
    await setAppState('dashboard_state', {...state, partnerBillingIntegration: integration});
    await recordPartnerBillingWebhookLog(req, {
      result: 'failed',
      httpStatus: 404,
      message: 'Invoice not found.',
      event,
      payload,
      replayedFromLogId: options.replayedFromLogId,
    });
    await writeAuditLog(req, {id: 'billing-webhook', name: 'Billing Webhook', role: 'External'}, 'partner_billing.webhook', 'partner_invoice', event.invoiceNo || event.invoiceId || '', 'failed', {
      reason: 'Invoice not found.',
      event,
      replayedFromLogId: options.replayedFromLogId,
    });
    return {httpStatus: 404, body: {ok: false, message: 'Invoice not found.', event}};
  }

  const now = new Date().toISOString();
  const currentInvoice = partnerInvoices[invoiceIndex];
  const nextInvoice = {
    ...currentInvoice,
    status: event.status,
    paidAt: event.status === 'paid' ? (currentInvoice.paidAt || now) : currentInvoice.paidAt,
    externalPaymentId: event.externalPaymentId || currentInvoice.externalPaymentId,
    externalProvider: event.provider || payload.provider || state.partnerBillingIntegration?.provider || currentInvoice.externalProvider,
    externalStatus: event.externalStatus || currentInvoice.externalStatus,
    lastSyncedAt: now,
    updatedAt: now,
  };
  const nextInvoices = [...partnerInvoices];
  nextInvoices[invoiceIndex] = nextInvoice;

  const integration = {
    ...(state.partnerBillingIntegration || {}),
    lastSyncStatus: 'success',
    lastSyncAt: now,
    lastSyncMessage: `Invoice ${nextInvoice.invoiceNo} updated to ${nextInvoice.status} by ${options.replayedFromLogId ? 'billing webhook replay' : 'billing webhook'}.`,
  };
  const nextState = {
    ...state,
    partnerInvoices: nextInvoices,
    partnerBillingIntegration: integration,
  };
  await setAppState('dashboard_state', nextState);
  await recordPartnerBillingWebhookLog(req, {
    result: 'success',
    httpStatus: 200,
    message: `Invoice ${nextInvoice.invoiceNo} updated to ${nextInvoice.status}.`,
    invoiceId: nextInvoice.id,
    invoiceNo: nextInvoice.invoiceNo,
    status: nextInvoice.status,
    externalStatus: nextInvoice.externalStatus,
    externalPaymentId: nextInvoice.externalPaymentId,
    provider: nextInvoice.externalProvider,
    event,
    payload,
    replayedFromLogId: options.replayedFromLogId,
  });
  await writeAuditLog(req, {id: options.replayedFromLogId ? 'billing-webhook-replay' : 'billing-webhook', name: options.replayedFromLogId ? 'Billing Webhook Replay' : 'Billing Webhook', role: options.replayedFromLogId ? 'Internal' : 'External'}, 'partner_billing.webhook', 'partner_invoice', nextInvoice.id, 'success', {
    invoiceNo: nextInvoice.invoiceNo,
    status: nextInvoice.status,
    externalStatus: nextInvoice.externalStatus,
    externalPaymentId: nextInvoice.externalPaymentId,
    replayedFromLogId: options.replayedFromLogId,
  });

  const notification = await persistSystemNotification({
    title: options.replayedFromLogId ? 'Partner invoice replayed' : 'Partner invoice updated',
    message: `Invoice ${nextInvoice.invoiceNo} is now ${nextInvoice.status}.`,
    level: nextInvoice.status === 'paid' ? 'Success' : 'Info',
    source: 'partner-billing',
    invoiceId: nextInvoice.id,
    invoiceNo: nextInvoice.invoiceNo,
  });
  broadcastRealtimeEvent('partner_billing_invoice', {invoice: nextInvoice, notification});
  return {httpStatus: 200, body: {ok: true, invoice: nextInvoice, event}};
};

const parsePartnerBillingDate = (value) => {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
};

const runPartnerInvoiceAging = async (req) => {
  const state = await getDashboardState();
  const partnerInvoices = Array.isArray(state.partnerInvoices) ? state.partnerInvoices : [];
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const overdueInvoices = [];

  const nextInvoices = partnerInvoices.map((invoice) => {
    if (invoice.status !== 'open') return invoice;
    const dueTimestamp = parsePartnerBillingDate(invoice.dueDate);
    if (!dueTimestamp || dueTimestamp >= todayStartUtc) return invoice;
    const nextInvoice = {
      ...invoice,
      status: 'overdue',
      lastSyncedAt: nowIso,
      updatedAt: nowIso,
    };
    overdueInvoices.push(nextInvoice);
    return nextInvoice;
  });

  const integration = {
    ...(state.partnerBillingIntegration || {}),
    lastSyncStatus: 'success',
    lastSyncAt: nowIso,
    lastSyncMessage: overdueInvoices.length
      ? `${overdueInvoices.length} invoice(s) marked overdue by invoice aging.`
      : 'Invoice aging completed. No overdue invoices found.',
  };

  await setAppState('dashboard_state', {
    ...state,
    partnerInvoices: nextInvoices,
    partnerBillingIntegration: integration,
  });

  await writeAuditLog(req, await getApiActor(req), 'partner_billing.invoice_aging.run', 'partner_invoice', 'overdue_check', 'success', {
    checked: partnerInvoices.length,
    overdueCount: overdueInvoices.length,
    invoiceNos: overdueInvoices.map((invoice) => invoice.invoiceNo),
  });

  const notification = overdueInvoices.length > 0
    ? await persistSystemNotification({
      title: 'Partner invoices overdue',
      message: `${overdueInvoices.length} invoice(s) are now overdue.`,
      level: 'Info',
      source: 'partner-billing',
      overdueCount: overdueInvoices.length,
    })
    : null;

  broadcastRealtimeEvent('partner_billing_invoice_aging', {
    checked: partnerInvoices.length,
    overdueCount: overdueInvoices.length,
    invoices: overdueInvoices,
    notification,
  });

  return {
    ok: true,
    checked: partnerInvoices.length,
    overdueCount: overdueInvoices.length,
    invoices: overdueInvoices,
    integration,
  };
};

const csvEscape = (value) => {
  const stringValue = String(value ?? '');
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
};

const reportRowsToCsv = (rows = []) => rows.map((row) => row.map(csvEscape).join(',')).join('\n');

const getReportSize = (rows = []) => {
  const bytes = Buffer.byteLength(reportRowsToCsv(rows), 'utf8');
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const getReportRangeLabel = (range) => {
  const labels = {
    last7days: 'Last 7 Days',
    last30days: 'Last 30 Days',
    thisMonth: 'This Month',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
  };
  return labels[range] || String(range || 'Custom Range');
};

const getGeneratedReports = async () => {
  if (db) {
    const saved = await getAppState('generated_reports');
    return Array.isArray(saved) ? saved : [];
  }
  return generatedReports;
};

const saveGeneratedReports = async (reports) => {
  const nextReports = Array.isArray(reports) ? reports.slice(0, 200) : [];
  if (db) {
    await setAppState('generated_reports', nextReports);
  } else {
    generatedReports = nextReports;
  }
  return nextReports;
};

const getDevicesForReport = (state, options = {}) => {
  const siteId = options.siteId || options.site || 'All';
  const deviceIds = Array.isArray(options.deviceIds) ? new Set(options.deviceIds.filter(Boolean)) : null;
  return (Array.isArray(state.devices) ? state.devices : []).filter((device) => {
    if (deviceIds && !deviceIds.has(device.id)) return false;
    if (siteId && siteId !== 'All' && device.siteId !== siteId) return false;
    return true;
  });
};

const buildReportAlerts = (state, devices) => {
  const deviceIds = new Set(devices.map((device) => device.id));
  const savedAlerts = Array.isArray(state.alerts)
    ? state.alerts.filter((alert) => !alert.deviceId || deviceIds.has(alert.deviceId))
    : [];
  if (savedAlerts.length > 0) return savedAlerts;

  return devices
    .filter((device) => device.status !== 'online')
    .map((device) => ({
      id: `alert-${device.id}`,
      deviceId: device.id,
      deviceName: device.name,
      level: device.status === 'warning' ? 'Warning' : 'Critical',
      status: 'active',
      message: device.lastSeen
        ? 'Device is offline or stale based on latest telemetry.'
        : 'Device has not reported telemetry yet.',
      timestamp: device.lastSeen || new Date().toISOString(),
    }));
};

const buildReportRows = (state, options = {}) => {
  const content = options.content || options.type || 'Energy';
  const rangeLabel = getReportRangeLabel(options.range || options.frequency);
  const generatedAt = new Date().toISOString();
  const devices = getDevicesForReport(state, options);
  const alerts = buildReportAlerts(state, devices);
  const site = (Array.isArray(state.sites) ? state.sites : []).find((item) => item.id === options.siteId);

  if (content === 'Devices') {
    return [
      ['Report', 'Device Health'],
      ['Range', rangeLabel],
      ['Site', site?.name || options.siteId || 'All Sites'],
      ['Generated At', generatedAt],
      [],
      ['Device ID', 'Name', 'Type', 'Status', 'Tags', 'Last Seen', 'Firmware', 'External Device ID', 'Metric', 'Value'],
      ...devices.flatMap((device) => {
        const metrics = Object.entries(device.metrics || {});
        const base = [
          device.id,
          device.name,
          device.type,
          device.status,
          (device.tags || []).join('|'),
          device.lastSeen || '',
          device.firmwareVersion || '',
          device.config?.externalDeviceId || device.id,
        ];
        return metrics.length
          ? metrics.map(([metric, value]) => [...base, metric, String(value)])
          : [[...base, '', '']];
      }),
    ];
  }

  if (content === 'Alerts') {
    return [
      ['Report', 'Alerts & Anomalies'],
      ['Range', rangeLabel],
      ['Site', site?.name || options.siteId || 'All Sites'],
      ['Generated At', generatedAt],
      [],
      ['Alert ID', 'Device ID', 'Device Name', 'Level', 'Status', 'Message', 'Timestamp'],
      ...alerts.map((alert) => [
        alert.id,
        alert.deviceId || '',
        alert.deviceName || '',
        alert.level || '',
        alert.status || '',
        alert.message || '',
        alert.timestamp || alert.createdAt || '',
      ]),
    ];
  }

  const totalEnergy = devices.reduce((sum, device) => sum + (Number(device.metrics?.energy) || Number(device.metrics?.energy_today) || 0), 0);
  const totalPower = devices.reduce((sum, device) => sum + (Number(device.metrics?.power) || 0), 0);

  return [
    ['Report', 'Energy Usage'],
    ['Range', rangeLabel],
    ['Site', site?.name || options.siteId || 'All Sites'],
    ['Generated At', generatedAt],
    [],
    ['Metric', 'Value'],
    ['Total Devices', String(devices.length)],
    ['Online Devices', String(devices.filter((device) => device.status === 'online').length)],
    ['Active Alerts', String(alerts.filter((alert) => alert.status === 'active').length)],
    ['Total Energy (kWh)', totalEnergy.toFixed(2)],
    ['Total Power (W)', totalPower.toFixed(2)],
    [],
    ['Device ID', 'Name', 'Type', 'Energy (kWh)', 'Power (W)', 'Status'],
    ...devices.map((device) => [
      device.id,
      device.name,
      device.type,
      String(device.metrics?.energy || device.metrics?.energy_today || ''),
      String(device.metrics?.power || ''),
      device.status,
    ]),
  ];
};

const createGeneratedReport = async (options = {}) => {
  const state = await getDashboardState();
  const content = options.content || options.type || 'Energy';
  const rows = buildReportRows(state, options);
  const report = {
    id: createId('report'),
    name: options.name || `${options.workflowName ? `${options.workflowName} ` : ''}${content} Report`,
    date: new Date().toISOString(),
    type: 'CSV',
    size: getReportSize(rows),
    content,
    range: options.range || options.frequency || 'last7days',
    siteId: options.siteId || 'All',
    source: options.source || 'manual',
    workflowId: options.workflowId || '',
    workflowName: options.workflowName || '',
    recipient: options.recipient || '',
    rows,
  };
  const reports = await getGeneratedReports();
  await saveGeneratedReports([report, ...reports]);
  return report;
};

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
  tagId: credential.tagId || '',
  groups: Array.isArray(credential.groups) ? credential.groups : [],
  lastCounter: Number.isFinite(Number(credential.lastCounter)) ? Number(credential.lastCounter) : null,
  hasLink: Boolean(credential.token),
  hasLatestQrLink: Boolean(credential.latestToken),
  rotateOnUse: Boolean(credential.rotateOnUse),
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
const normalizeAccessMethod = (value) => {
  const method = String(value || 'qr').trim().toLowerCase();
  return ['qr', 'nfc_basic', 'nfc', 'caller_id', 'sms'].includes(method) ? method : 'qr';
};
const normalizeAccessGroups = (value) => {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(source.map((item) => String(item).trim()).filter(Boolean)));
};
const parseNfcCounter = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = /^[0-9]+$/.test(text)
    ? Number.parseInt(text, 10)
    : /^[0-9a-f]+$/i.test(text)
      ? Number.parseInt(text, 16)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
const counterToBuffer = (counter, endian = 'be') => {
  const buffer = Buffer.alloc(3);
  if (endian === 'le') {
    buffer[0] = counter & 0xff;
    buffer[1] = (counter >> 8) & 0xff;
    buffer[2] = (counter >> 16) & 0xff;
  } else {
    buffer[0] = (counter >> 16) & 0xff;
    buffer[1] = (counter >> 8) & 0xff;
    buffer[2] = counter & 0xff;
  }
  return buffer;
};
const verifyNfcCmac = ({aesKey, uid, counter, cmac}) => {
  const normalizedKey = normalizeHex(aesKey);
  const normalizedUid = normalizeHex(uid);
  const normalizedCmac = normalizeHex(cmac);
  if (![32, 48, 64].includes(normalizedKey.length)) return {ok: false, reason: 'Access AES Key must be 16, 24, or 32 bytes in hex.'};
  if (!isHex(normalizedUid) || normalizedUid.length < 8 || normalizedUid.length % 2 !== 0) return {ok: false, reason: 'NFC uid must be a hex string.'};
  if (!isHex(normalizedCmac, 16)) return {ok: false, reason: 'NFC cmac must be 8 bytes / 16 hex characters.'};

  const key = Buffer.from(normalizedKey, 'hex');
  const uidBytes = Buffer.from(normalizedUid, 'hex');
  const messages = [
    Buffer.concat([uidBytes, counterToBuffer(counter, 'be')]),
    Buffer.concat([uidBytes, counterToBuffer(counter, 'le')]),
  ];
  const candidates = messages.flatMap((message) => {
    const mac = aesCmac(key, message);
    return [
      mac.subarray(0, 8).toString('hex'),
      mac.subarray(8, 16).toString('hex'),
      Buffer.from([mac[1], mac[3], mac[5], mac[7], mac[9], mac[11], mac[13], mac[15]]).toString('hex'),
    ];
  });

  return candidates.includes(normalizedCmac)
    ? {ok: true}
    : {ok: false, reason: 'NFC CMAC verification failed.'};
};
const sanitizeAccessDefinition = (payload = {}, existing = {}) => ({
  ...existing,
  ...payload,
  method: normalizeAccessMethod(payload.method ?? existing.method),
  aesKey: String(payload.aesKey ?? existing.aesKey ?? '').trim(),
  credentialGroups: normalizeAccessGroups(payload.credentialGroups ?? existing.credentialGroups),
  extraParams: payload.extraParams && typeof payload.extraParams === 'object'
    ? payload.extraParams
    : existing.extraParams || {},
});
const canUseLatestQrLink = (credential) => (
  (Number(credential?.refreshIntervalSeconds || 0) > 0 || Boolean(credential?.rotateOnUse))
  && Number(credential?.maxUses || 1) > 1
);

const createAccessLink = (req, token) => {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}/qr/${token}`;
};

const createLatestQrLink = (req, token) => {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}/q/${token}`;
};

const createNfcAccessLink = (req, token) => {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}/nfc/${token}`;
};

const createNfcDnaAccessLink = (req, token) => {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}/nfc/${token}?uid=00000000000000&ctr=000000&cmac=0000000000000000`;
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

const getTelemetryMessageContext = async (message) => {
  if (!message || typeof message !== 'object') return {};
  const device = await findDashboardDeviceForTelemetry(message);
  const deviceId = message.device_id || message.deviceId || message.id || device?.config?.externalDeviceId || device?.id;
  return {
    device,
    deviceId: device?.id || deviceId || '',
    siteId: message.site_id || message.siteId || device?.siteId || '',
  };
};

const dataSourceChannelAllowsMessage = async (channel, message) => {
  const siteIds = splitList(channel?.siteIds);
  const deviceIds = splitList(channel?.deviceIds);
  if (siteIds.length === 0 && deviceIds.length === 0) return true;

  const context = await getTelemetryMessageContext(message);
  const contextDeviceId = String(context.deviceId || '').trim();
  const contextSiteId = String(context.siteId || '').trim();
  const deviceAllowed = deviceIds.length === 0 || (contextDeviceId && deviceIds.includes(contextDeviceId));
  const siteAllowed = siteIds.length === 0 || (contextSiteId && siteIds.includes(contextSiteId));
  return Boolean(deviceAllowed && siteAllowed);
};

const filterTelemetryPayloadByChannel = async (channel, payload) => {
  const messages = Array.isArray(payload) ? payload : [payload];
  const allowed = [];
  for (const message of messages) {
    if (await dataSourceChannelAllowsMessage(channel, message)) {
      allowed.push(message);
    }
  }
  return {
    payload: Array.isArray(payload) ? allowed : allowed[0],
    allowedCount: allowed.length,
    rejectedCount: Math.max(0, messages.length - allowed.length),
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
    if (config.method && config.method !== event.source) return false;
    return !config.accessId || config.accessId === event.accessId;
  }

  if (config.type === 'nfc_access') {
    if (event.type !== 'access' || event.source !== 'nfc') return false;
    return !config.accessId || config.accessId === event.accessId;
  }

  if (config.type === 'schedule') {
    return event.type === 'schedule';
  }

  return false;
};

const getExecutableWorkflow = (workflow) => {
  const snapshot = workflow?.publishedSnapshot;
  if (!snapshot || !Array.isArray(snapshot.nodes)) return workflow;
  return {
    ...workflow,
    name: snapshot.name || workflow.name,
    description: snapshot.description || workflow.description,
    nodes: snapshot.nodes,
    edges: Array.isArray(snapshot.edges) ? snapshot.edges : workflow.edges,
    runningVersion: workflow.publishedVersion || workflow.draftVersion || 1,
  };
};

const createTriggerDedupeKey = (workflow, trigger, event) => {
  const context = {};
  const nodeName = normalizeWorkflowNodeName(trigger, trigger.id);
  const input = createWorkflowNodeInput(trigger, event, context, nodeName);
  const runtimeContext = {
    [nodeName]: {
      nodeId: trigger.id,
      type: trigger.config?.type || 'trigger',
      status: 'running',
      input,
      output: createWorkflowTriggerOutput(trigger, event),
    },
  };
  const configuredKey = trigger.config?.dedupeKey
    ? resolveWorkflowValue(trigger.config.dedupeKey, runtimeContext, nodeName)
    : '';
  const fallbackKey = event.deviceId
    || event.message?.device_id
    || event.message?.deviceId
    || event.credentialId
    || event.accessId
    || event.token
    || event.source
    || event.type
    || 'event';
  return `${workflow.id}:${trigger.id}:${String(configuredKey || fallbackKey)}`;
};

const shouldExecuteWorkflowTrigger = (workflow, trigger, event) => {
  const cooldownMs = parseWorkflowDurationMs(trigger.config?.cooldown || trigger.config?.debounce || '0s', 24 * 60 * 60 * 1000);
  if (!cooldownMs) return true;
  const key = createTriggerDedupeKey(workflow, trigger, event);
  const now = Date.now();
  const previous = workflowTriggerLastRuns.get(key) || 0;
  if (now - previous < cooldownMs) return false;
  workflowTriggerLastRuns.set(key, now);
  return true;
};

const cronFieldMatches = (field, value) => {
  const part = String(field || '*').trim();
  if (part === '*') return true;
  if (part.includes(',')) return part.split(',').some((item) => cronFieldMatches(item, value));
  if (part.startsWith('*/')) {
    const interval = Number(part.slice(2));
    return Number.isFinite(interval) && interval > 0 && value % interval === 0;
  }
  if (part.includes('-')) {
    const [start, end] = part.split('-').map(Number);
    return Number.isInteger(start) && Number.isInteger(end) && start <= value && value <= end;
  }
  return Number(part) === value;
};

const validateCronField = (field, min, max) => {
  const part = String(field || '').trim();
  if (!part) return false;
  if (part === '*') return true;
  if (part.includes(',')) return part.split(',').every((item) => validateCronField(item, min, max));
  if (part.startsWith('*/')) {
    const interval = Number(part.slice(2));
    return Number.isInteger(interval) && interval >= 1 && interval <= Math.max(1, max - min + 1);
  }
  if (part.includes('-')) {
    const [start, end] = part.split('-').map(Number);
    return Number.isInteger(start) && Number.isInteger(end) && start >= min && end <= max && start <= end;
  }
  const value = Number(part);
  return Number.isInteger(value) && value >= min && value <= max;
};

const validateCronExpression = (expression) => {
  const parts = String(expression || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) return {valid: false, reason: 'Cron expression must have exactly 5 fields.'};
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  const invalidIndex = parts.findIndex((part, index) => !validateCronField(part, ranges[index][0], ranges[index][1]));
  if (invalidIndex >= 0) return {valid: false, reason: `Cron field ${invalidIndex + 1} is invalid.`};
  return {valid: true, parts};
};

const estimateCronMatchesPerDay = (expression) => {
  const validation = validateCronExpression(expression);
  if (!validation.valid) return 0;
  const base = new Date('2026-01-05T00:00:00.000Z');
  let matches = 0;
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const date = new Date(base.getTime() + minute * 60000);
    if (cronMatchesNow(expression, date)) matches += 1;
  }
  return matches;
};

const cronMatchesNow = (expression, date = new Date()) => {
  const parts = String(expression || '* * * * *').trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return cronFieldMatches(minute, date.getMinutes())
    && cronFieldMatches(hour, date.getHours())
    && cronFieldMatches(dayOfMonth, date.getDate())
    && cronFieldMatches(month, date.getMonth() + 1)
    && (cronFieldMatches(dayOfWeek, date.getDay()) || (date.getDay() === 0 && cronFieldMatches(dayOfWeek, 7)));
};

const parseConditionExpression = (expression) => {
  const match = String(expression || '').trim().match(/^([a-zA-Z0-9_.-]+)\s*(>=|<=|===|!==|==|!=|>|<|=)\s*(.+)$/);
  if (!match) return null;
  return {metric: match[1], operator: match[2], value: match[3].replace(/^["']|["']$/g, '')};
};

const conditionMatchesEvent = (condition, event, context = {}, nodeName = normalizeWorkflowNodeName(condition, condition?.id)) => {
  const input = createWorkflowNodeInput(condition, event, context, nodeName);
  let config = input.config || {};
  const runtimeContext = {
    ...context,
    [nodeName]: {
      ...(context[nodeName] || {}),
      nodeId: condition.id,
      type: config.type || condition.type,
      status: 'running',
      input: sanitizeWorkflowLogValue(input),
    },
  };
  config = resolveWorkflowValue(config, runtimeContext, nodeName);
  input.config = config;

  if (config.type === 'else' || config.type === 'default') {
    return true;
  }

  if (config.type === 'switch') {
    return true;
  }

  if (config.type === 'case') {
    const scope = {input, event, context: runtimeContext, config, currentNodeName: nodeName};
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
    const metricValue = String(config.metric).startsWith('$.')
      ? getWorkflowScopedValue(config.metric, {input, event, context: runtimeContext, config, currentNodeName: nodeName})
      : getMetricValue(event, config.metric);
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

const persistWorkflowRun = async (run, workflowForAlert = null) => {
  const safeRun = sanitizeWorkflowLogValue(run);
  workflowRuns.unshift(safeRun);
  if (workflowRuns.length > maxWorkflowRuns) workflowRuns.splice(maxWorkflowRuns);

  if (db) {
    await queryDb(
      `INSERT INTO workflow_runs (id, workflow_id, workflow_name, workflow_version, trigger_type, event_source, status, event, steps, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::timestamptz, $11::timestamptz)`,
      [
        safeRun.id,
        safeRun.workflowId,
        safeRun.workflowName,
        Number(safeRun.workflowVersion || 1),
        safeRun.triggerType,
        safeRun.eventSource,
        safeRun.status,
        JSON.stringify(safeRun.event),
        JSON.stringify(safeRun.steps),
        safeRun.startedAt,
        safeRun.finishedAt,
      ]
    );
  }

  if (workflowForAlert) {
    await evaluateWorkflowRunAlert(workflowForAlert, safeRun).catch((error) => {
      console.error('Workflow run alert evaluation failed', error);
    });
  }
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

const findDeviceControlCommandById = async (commandId) => {
  const localCommand = deviceControlCommands.find((command) => command.id === commandId) || null;
  if (!db) return localCommand;

  const result = await queryDb(
    `SELECT id, device_id AS "deviceId", device_name AS "deviceName", command, parameters,
            requested_by AS "requestedBy", requested_by_role AS "requestedByRole", source,
            status, result, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM device_control_commands
     WHERE id = $1`,
    [commandId]
  );
  return result.rows[0] || localCommand;
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

const publicCommandParameters = (parameters = {}) => Object.fromEntries(
  Object.entries(parameters || {}).filter(([key]) => !String(key).startsWith('__'))
);

const publicDeviceCommandPayload = (command) => ({
  command_id: command.id,
  device_id: command.deviceId,
  command: command.command,
  parameters: publicCommandParameters(command.parameters || {}),
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

const buildDeviceCommandTemplateContext = (command, device) => ({
    commandId: command.id,
    command: command.command,
    deviceId: command.deviceId,
    externalDeviceId: device?.config?.externalDeviceId || command.deviceId,
    requestedBy: command.requestedBy,
    source: command.source,
    timestamp: command.createdAt,
    parameters: publicCommandParameters(command.parameters || {}),
    parametersJson: JSON.stringify(publicCommandParameters(command.parameters || {})),
    rollback: command.parameters?.__rollback || null,
});

const renderDeviceCommandTemplate = (template, command, device) => {
  const context = buildDeviceCommandTemplateContext(command, device);
  return String(template || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
    const value = getTemplateContextValue(context, key);
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
};

const renderDeviceCommandPayload = (command, device, template) => {
  if (!template) return publicDeviceCommandPayload(command);
  const rendered = renderDeviceCommandTemplate(template, command, device);

  try {
    return JSON.parse(rendered);
  } catch (error) {
    return rendered;
  }
};

const parseDeviceCommandHeaders = (headersTemplate, command, device) => {
  if (!headersTemplate) return {};
  const rendered = renderDeviceCommandTemplate(headersTemplate, command, device);
  try {
    const parsed = JSON.parse(rendered);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, value]) => key && value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    );
  } catch (error) {
    return {};
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

  const payload = renderDeviceCommandPayload(command, device, device?.config?.mqttCommandTemplate);
  runtime.socket.write(createMqttPublishPacket(topic, typeof payload === 'string' ? payload : JSON.stringify(payload)));
  return {ok: true, message: `Published to MQTT topic ${topic}`};
};

const dispatchDeviceCommandToHttp = async (command, device) => {
  const urlTemplate = device?.config?.httpCommandUrl || device?.config?.httpCommandEndpoint || device?.config?.commandUrl;
  if (!urlTemplate) return {ok: false, message: 'No HTTP command endpoint configured.'};

  const url = renderDeviceCommandTemplate(urlTemplate, command, device).trim();
  if (!/^https?:\/\//i.test(url)) {
    return {ok: false, message: 'HTTP command endpoint must start with http:// or https://.'};
  }

  const method = ['POST', 'PUT', 'PATCH'].includes(String(device?.config?.httpCommandMethod || '').toUpperCase())
    ? String(device.config.httpCommandMethod).toUpperCase()
    : 'POST';
  const timeoutMs = Math.max(1000, Math.min(Number(device?.config?.httpCommandTimeoutMs || 8000), 60000));
  const payload = renderDeviceCommandPayload(command, device, device?.config?.httpCommandTemplate);
  const headers = {
    'content-type': typeof payload === 'string' ? 'text/plain' : 'application/json',
    ...parseDeviceCommandHeaders(device?.config?.httpCommandHeaders, command, device),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseText = await response.text().catch(() => '');
    const preview = responseText ? `: ${responseText.slice(0, 240)}` : '';
    if (!response.ok) {
      return {ok: false, message: `HTTP command endpoint returned ${response.status}${preview}`};
    }
    return {ok: true, message: `Sent via HTTP ${method} ${url} (${response.status})${preview}`};
  } catch (error) {
    return {ok: false, message: `HTTP command failed: ${error.name === 'AbortError' ? 'request timeout' : error.message}`};
  } finally {
    clearTimeout(timer);
  }
};

const dispatchDeviceControlCommand = async (command, device) => {
  if (!device || command.status === 'rejected') return command;

  const manualPriority = getDeviceManualPriorityState(device);
  if (manualPriority.blocked) {
    return await updateDeviceControlCommand(command.id, {
      status: 'rejected',
      result: `Blocked by local manual priority. ${manualPriority.key}=${manualPriority.value}. Remote commands are disabled until the device returns to remote/auto mode.`,
    }) || command;
  }

  const protocol = String(device.config?.protocol || '').toLowerCase();
  const dataSource = String(device.config?.dataSource || '').toLowerCase();
  const hasMqttRoute = dataSource === 'mqtt' || protocol === 'mqtt' || Boolean(device.config?.mqttTopic || device.config?.commandTopic || device.config?.mqttCommandTopic);
  const hasHttpRoute = Boolean(device.config?.httpCommandUrl || device.config?.httpCommandEndpoint || device.config?.commandUrl);
  const dispatchMessages = [];

  if (hasMqttRoute) {
    const publishResult = await publishDeviceCommandToMqtt(command, device);
    if (publishResult.ok) {
      return await updateDeviceControlCommand(command.id, {
        status: 'sent',
        result: `${publishResult.message}. Waiting for device ACK.`,
      }) || command;
    }
    dispatchMessages.push(`MQTT: ${publishResult.message}`);
  }

  if (hasHttpRoute) {
    const httpResult = await dispatchDeviceCommandToHttp(command, device);
    if (httpResult.ok) {
      return await updateDeviceControlCommand(command.id, {
        status: 'sent',
        result: `${httpResult.message}. Waiting for device ACK or gateway confirmation.`,
      }) || command;
    }
    dispatchMessages.push(`HTTP: ${httpResult.message}`);
  }

  return await updateDeviceControlCommand(command.id, {
    status: 'queued',
    result: `Queued for device polling. Gateway can fetch it from /api/device-commands/pending.${dispatchMessages.length ? ` Connector attempts: ${dispatchMessages.join(' | ')}` : ''}`,
  }) || command;
};

const canApproveDeviceCommand = (role) => ['Owner', 'Admin'].includes(String(role || ''));

const getDeviceManualPriorityState = (device) => {
  if (!device?.config?.localManualPriorityEnabled) {
    return {blocked: false};
  }

  const key = String(device.config.localManualPriorityMetric || 'mode').trim() || 'mode';
  const blockingValues = splitList(device.config.localManualPriorityValues || 'manual,local,hand,maintenance')
    .map((value) => value.toLowerCase());
  const candidates = [
    device.metrics?.[key],
    device.config?.controlState?.[key],
    device.config?.controlState?.[device.config?.localManualPriorityMetric],
    device.status,
  ].filter((value) => value !== undefined && value !== null);
  const matchedValue = candidates.find((value) => {
    const normalized = String(value).trim().toLowerCase();
    return blockingValues.includes(normalized) || (typeof value === 'boolean' && value === true && blockingValues.includes('true'));
  });

  return {
    blocked: matchedValue !== undefined,
    key,
    value: matchedValue,
    blockingValues,
  };
};

const isDangerousDeviceCommand = (command, parameters = {}) => {
  const text = [
    command,
    ...Object.keys(parameters || {}),
    ...Object.values(parameters || {}).map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value)),
  ].join(' ').toLowerCase();
  return /power_on|power_off|restart|reset|stop|shutdown|start|enable|disable|unlock|lock|open|close|relay|output|valve|motor|pump|drain|pulse|frequency|pressure|speed|position|write/.test(text);
};

const shouldRequireDeviceCommandApproval = (command) => (
  command.status !== 'rejected'
  && !canApproveDeviceCommand(command.requestedByRole)
  && isDangerousDeviceCommand(command.command, command.parameters)
);

const getServerDeviceControlDefinitions = (device) => (
  Array.isArray(device?.config?.controlDefinitions)
    ? device.config.controlDefinitions.filter((definition) => definition && definition.id)
    : []
);

const getServerDeviceControlDefinition = (device, command) => (
  getServerDeviceControlDefinitions(device).find((definition) => definition.id === command) || null
);

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
  const commandName = String(command || 'unknown');
  const commandParameters = parameters && typeof parameters === 'object' ? parameters : {value: parameters};
  const deviceControlDefinitions = getServerDeviceControlDefinitions(device);
  const controlDefinition = device ? getServerDeviceControlDefinition(device, commandName) : null;
  const normalizedCommand = {
    id: createId('cmd'),
    deviceId: device?.id || String(deviceId || ''),
    deviceName: device?.name || String(deviceId || 'Unknown device'),
    command: commandName,
    parameters: controlDefinition
      ? {
        ...commandParameters,
        __control: {
          id: controlDefinition.id,
          label: controlDefinition.label || controlDefinition.id,
          valueType: controlDefinition.valueType || 'none',
          parameterKey: controlDefinition.parameterKey || '',
        },
      }
      : commandParameters,
    requestedBy,
    requestedByRole,
    source,
    status: device && (deviceControlDefinitions.length === 0 || controlDefinition) ? 'queued' : 'rejected',
    result: !device
      ? 'Device not found.'
      : deviceControlDefinitions.length > 0 && !controlDefinition
        ? `Control action ${commandName} is not configured for this device.`
        : 'Command recorded. Dispatching through configured connector.',
    createdAt,
    updatedAt: createdAt,
  };

  if (shouldRequireDeviceCommandApproval(normalizedCommand)) {
    normalizedCommand.status = 'pending_approval';
    normalizedCommand.result = 'Dangerous operation is waiting for Owner/Admin approval. No command has been sent to the device.';
  }

  const manualPriority = getDeviceManualPriorityState(device);
  if (device && manualPriority.blocked) {
    normalizedCommand.status = 'rejected';
    normalizedCommand.result = `Blocked by local manual priority. ${manualPriority.key}=${manualPriority.value}. Remote commands are disabled until the device returns to remote/auto mode.`;
  }

  await persistDeviceControlCommand(normalizedCommand);
  if (normalizedCommand.status === 'pending_approval') return normalizedCommand;
  return await dispatchDeviceControlCommand(normalizedCommand, device);
};

const normalizeNotificationConfig = (channel = {}) => channel.config && typeof channel.config === 'object'
  ? channel.config
  : {};

const notificationText = (notification = {}) => ({
  title: notification.title || 'AI IoT Dashboard',
  message: notification.message || notification.body || 'Notification channel test message.',
  level: notification.level || 'Info',
  source: notification.source || 'system',
  workflowName: notification.workflowName || '',
  createdAt: notification.createdAt || new Date().toISOString(),
});

const renderNotificationTemplate = (template, notification = {}, channel = {}) => {
  const text = notificationText(notification);
  const values = {
    title: text.title,
    message: text.message,
    level: text.level,
    source: text.source,
    workflowName: text.workflowName,
    createdAt: text.createdAt,
    channelName: channel.name || '',
  };
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => values[key] ?? '');
};

const parseHeaderLine = (headerLine = '') => {
  const index = String(headerLine).indexOf(':');
  if (index <= 0) return {};
  const key = headerLine.slice(0, index).trim();
  const value = headerLine.slice(index + 1).trim();
  return key ? {[key]: value} : {};
};

const postJsonNotification = async (url, body, options = {}) => {
  if (!url) return {ok: false, message: `${options.label || 'Notification'} URL is required.`};
  try {
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      message: response.ok ? `${options.label || 'Notification'} sent.` : `${options.label || 'Notification'} failed: ${response.status}${text ? ` ${text.slice(0, 160)}` : ''}`,
      status: response.status,
    };
  } catch (error) {
    return {ok: false, message: `${options.label || 'Notification'} failed: ${error.message || 'Unable to reach provider.'}`};
  }
};

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

  try {
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
  } catch (error) {
    return {ok: false, message: `Bark test failed: ${error.message || 'Unable to reach Bark server.'}`};
  }
};

const sendWebhookNotification = async (channel, notification) => {
  const config = normalizeNotificationConfig(channel);
  const url = config.url || channel.target;
  const headers = parseHeaderLine(config.secretHeader);
  return postJsonNotification(url, notification, {
    label: 'Webhook notification',
    method: config.method || 'POST',
    headers,
  });
};

const sendSlackNotification = async (channel, notification) => {
  const config = normalizeNotificationConfig(channel);
  const url = config.webhookUrl || channel.target;
  const text = notificationText(notification);
  const body = {
    text: renderNotificationTemplate(config.textTemplate, notification, channel) || `*${text.title}*\n${text.message}`,
    username: config.username || undefined,
    channel: config.channel || undefined,
  };
  return postJsonNotification(url, body, {label: 'Slack notification'});
};

const sendTelegramNotification = async (channel, notification) => {
  const config = normalizeNotificationConfig(channel);
  const botToken = String(config.botToken || '').trim();
  const chatId = String(config.chatId || channel.target || '').trim();
  if (!botToken) return {ok: false, message: 'Telegram Bot Token is required.'};
  if (!chatId) return {ok: false, message: 'Telegram Chat ID is required.'};
  const text = notificationText(notification);
  const body = {
    chat_id: chatId,
    text: renderNotificationTemplate(config.textTemplate, notification, channel) || `${text.title}\n${text.message}`,
    disable_web_page_preview: true,
  };
  if (config.parseMode) body.parse_mode = config.parseMode;
  return postJsonNotification(`https://api.telegram.org/bot${botToken}/sendMessage`, body, {label: 'Telegram notification'});
};

const sendProviderWebhookNotification = async (channel, notification, label) => {
  const config = normalizeNotificationConfig(channel);
  const url = config.webhookUrl || config.url;
  const text = notificationText(notification);
  const body = {
    provider: config.provider || 'custom',
    to: config.recipients || config.phoneNumber || config.to || channel.target || '',
    templateId: config.templateId || '',
    subject: renderNotificationTemplate(config.subjectTemplate || config.subjectPrefix, notification, channel) || text.title,
    text: renderNotificationTemplate(config.textTemplate, notification, channel) || text.message,
    notification,
  };
  return postJsonNotification(url, body, {label});
};

const createTestNotification = () => ({
  title: 'AI IoT Dashboard',
  message: 'Notification channel test message.',
  level: 'Info',
  source: 'settings:test',
  createdAt: new Date().toISOString(),
});

const buildAiCopilotPrompt = ({query = '', localResponse = {}, contextSummary = {}} = {}) => [
  'You are an industrial IoT operations copilot.',
  'Use the provided dashboard context and local deterministic analysis.',
  'Return concise, operator-friendly guidance. Do not invent device data that is not present.',
  'Respond as JSON with keys: title, answer, recommendations.',
  '',
  `User question: ${query}`,
  '',
  `Local analysis JSON: ${JSON.stringify(localResponse).slice(0, 12000)}`,
  '',
  `Context summary JSON: ${JSON.stringify(contextSummary).slice(0, 8000)}`,
].join('\n');

const parseAiCopilotText = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  const jsonCandidate = trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  try {
    const parsed = JSON.parse(jsonCandidate);
    return parsed && typeof parsed === 'object' ? parsed : {answer: trimmed};
  } catch {
    return {answer: trimmed};
  }
};

const callOpenAiCompatibleCopilot = async (prompt) => {
  const baseUrl = aiCopilotBaseUrl || 'https://api.openai.com/v1';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${aiCopilotApiKey}`,
    },
    body: JSON.stringify({
      model: aiCopilotModel,
      messages: [
        {role: 'system', content: 'You are a careful industrial IoT operations assistant.'},
        {role: 'user', content: prompt},
      ],
      temperature: 0.2,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI-compatible request failed: ${response.status}`);
  return parseAiCopilotText(payload.choices?.[0]?.message?.content || '');
};

const callGeminiCopilot = async (prompt) => {
  const baseUrl = aiCopilotBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl}/models/${encodeURIComponent(aiCopilotModel)}:generateContent?key=${encodeURIComponent(aiCopilotApiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      contents: [{role: 'user', parts: [{text: prompt}]}],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Gemini request failed: ${response.status}`);
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
  return parseAiCopilotText(text);
};

const callCustomCopilot = async ({query, localResponse, contextSummary, prompt}) => {
  if (!aiCopilotBaseUrl) throw new Error('AI_COPILOT_BASE_URL is required for custom provider.');
  const headers = {'content-type': 'application/json'};
  if (aiCopilotApiKey) headers.authorization = `Bearer ${aiCopilotApiKey}`;
  const response = await fetch(aiCopilotBaseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: aiCopilotModel,
      query,
      prompt,
      localResponse,
      contextSummary,
    }),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {answer: text};
  }
  if (!response.ok) throw new Error(payload.error || payload.message || `Custom AI request failed: ${response.status}`);
  return payload;
};

const callExternalAiCopilot = async ({query, localResponse, contextSummary}) => {
  if (!aiCopilotProvider || aiCopilotProvider === 'local' || aiCopilotProvider === 'disabled') {
    return {usedExternal: false, reason: 'External AI provider is not configured.'};
  }
  if (!aiCopilotApiKey && aiCopilotProvider !== 'custom') {
    return {usedExternal: false, reason: 'AI_COPILOT_API_KEY is not configured.'};
  }

  const prompt = buildAiCopilotPrompt({query, localResponse, contextSummary});
  const startedAt = Date.now();
  try {
    const external = aiCopilotProvider === 'gemini'
      ? await callGeminiCopilot(prompt)
      : aiCopilotProvider === 'custom'
        ? await callCustomCopilot({query, localResponse, contextSummary, prompt})
        : await callOpenAiCompatibleCopilot(prompt);
    return {
      usedExternal: true,
      provider: aiCopilotProvider,
      model: aiCopilotModel,
      latencyMs: Date.now() - startedAt,
      external,
    };
  } catch (error) {
    return {
      usedExternal: false,
      provider: aiCopilotProvider,
      model: aiCopilotModel,
      reason: error.message || 'External AI request failed.',
    };
  }
};

const testNotificationChannel = async (channel) => {
  if (!channel?.enabled) return {ok: false, message: 'Channel is disabled.'};
  const notification = createTestNotification();

  if (channel.type === 'bark') {
    return sendBarkNotification(channel);
  }

  if (channel.type === 'webhook') {
    return sendWebhookNotification(channel, notification);
  }

  if (channel.type === 'slack') {
    return sendSlackNotification(channel, notification);
  }

  if (channel.type === 'telegram') {
    return sendTelegramNotification(channel, notification);
  }

  if (channel.type === 'email') {
    return sendProviderWebhookNotification(channel, notification, 'Email provider notification');
  }

  if (channel.type === 'sms') {
    return sendProviderWebhookNotification(channel, notification, 'SMS provider notification');
  }

  if (channel.type === 'whatsapp') {
    return sendProviderWebhookNotification(channel, notification, 'WhatsApp provider notification');
  }

  return {ok: false, message: `${channel.type || 'Unknown'} test connector is not implemented yet.`};
};

const getSystemNotifications = async () => {
  if (db) {
    const saved = await getAppState('system_notifications');
    return Array.isArray(saved) ? saved : [];
  }
  return systemNotifications;
};

const saveSystemNotifications = async (notifications) => {
  const nextNotifications = notifications.slice(0, maxSystemNotifications);
  if (db) {
    await setAppState('system_notifications', nextNotifications);
  } else {
    systemNotifications.splice(0, systemNotifications.length, ...nextNotifications);
  }
  return nextNotifications;
};

const sendNotificationToChannel = async (channel, notification) => {
  if (!channel?.enabled) return {ok: false, message: 'Channel disabled.'};
  if (channel.type === 'bark') {
    return sendBarkNotification(channel, {
      title: notification.title || 'System Notification',
      body: notification.message || '',
    });
  }
  if (channel.type === 'webhook') {
    return sendWebhookNotification(channel, notification);
  }
  if (channel.type === 'slack') {
    return sendSlackNotification(channel, notification);
  }
  if (channel.type === 'telegram') {
    return sendTelegramNotification(channel, notification);
  }
  if (channel.type === 'email') {
    return sendProviderWebhookNotification(channel, notification, 'Email provider notification');
  }
  if (channel.type === 'sms') {
    return sendProviderWebhookNotification(channel, notification, 'SMS provider notification');
  }
  if (channel.type === 'whatsapp') {
    return sendProviderWebhookNotification(channel, notification, 'WhatsApp provider notification');
  }
  return {ok: false, message: `${channel.type || 'Unknown'} connector is not implemented.`};
};

const persistSystemNotification = async (notification) => {
  const current = await getSystemNotifications();
  const nextNotification = {
    ...notification,
    id: notification.id || createId('sys-notice'),
    title: notification.title || 'System Notification',
    message: notification.message || '',
    level: notification.level || 'Info',
    source: notification.source || 'workflow',
    workflowId: notification.workflowId || '',
    workflowName: notification.workflowName || '',
    createdAt: notification.createdAt || new Date().toISOString(),
  };
  await saveSystemNotifications([nextNotification, ...current]);
  return nextNotification;
};

const dispatchWorkflowNotification = async (workflow, config, event) => {
  const notification = await persistSystemNotification({
    title: config.title || 'System Notification',
    message: config.message || '',
    level: config.level || 'Info',
    source: `workflow:${workflow.id}`,
    workflowId: workflow.id,
    workflowName: workflow.name,
    eventType: event.type,
  });
  const state = await getDashboardState();
  const channels = Array.isArray(state.notificationChannels) ? state.notificationChannels : [];
  const results = [];
  for (const channel of channels.filter((item) => item.enabled)) {
    try {
      results.push({channelId: channel.id, channelName: channel.name, ...(await sendNotificationToChannel(channel, notification))});
    } catch (error) {
      results.push({channelId: channel.id, channelName: channel.name, ok: false, message: error.message});
    }
  }
  return {notification, channels: results};
};

const dispatchSecurityAlert = async (type, payload = {}) => {
  const state = await getDashboardState();
  const settings = state.securitySettings || {};
  if (process.env.SECURITY_ALERTS_ENABLED === 'false' || settings.securityAlertsEnabled === false) {
    return null;
  }

  const key = `${type}:${payload.email || ''}:${payload.ip || ''}`;
  const lastSent = securityAlertLastSent.get(key) || 0;
  if (securityAlertCooldownMs > 0 && Date.now() - lastSent < securityAlertCooldownMs) {
    return null;
  }
  securityAlertLastSent.set(key, Date.now());

  const titleByType = {
    login_locked: 'Security alert: login temporarily locked',
    unapproved_login: 'Security alert: unapproved account login attempt',
    weak_password_register: 'Security alert: weak password registration attempt',
    unusual_login: 'Security alert: new login IP detected',
    ip_blocked: 'Security alert: blocked IP attempt',
  };
  const notification = await persistSystemNotification({
    title: titleByType[type] || 'Security alert',
    message: payload.message || '',
    level: payload.level || 'Warning',
    source: `security:${type}`,
    securityAlertType: type,
    email: payload.email || '',
    ip: payload.ip || '',
    createdAt: new Date().toISOString(),
  });

  const channels = [];
  if (settings.securityAlertChannelsEnabled !== false) {
    const notificationChannels = Array.isArray(state.notificationChannels) ? state.notificationChannels : [];
    for (const channel of notificationChannels.filter((item) => item.enabled)) {
      try {
        channels.push({channelId: channel.id, channelName: channel.name, ...(await sendNotificationToChannel(channel, notification))});
      } catch (error) {
        channels.push({channelId: channel.id, channelName: channel.name, ok: false, message: error.message});
      }
    }
  }

  return {notification, channels};
};

const getWorkflowRunDurationMs = (run) => {
  const started = new Date(run?.startedAt || run?.started_at || '').getTime();
  const finished = new Date(run?.finishedAt || run?.finished_at || '').getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return 0;
  return finished - started;
};

const loadRecentWorkflowRuns = async (workflowId, limit = 20) => {
  if (db) {
    const result = await queryDb(
      `SELECT id, workflow_id AS "workflowId", workflow_name AS "workflowName", workflow_version AS "workflowVersion", trigger_type AS "triggerType",
              event_source AS "eventSource", status, event, steps, started_at AS "startedAt", finished_at AS "finishedAt"
       FROM workflow_runs
       WHERE workflow_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [workflowId, limit]
    );
    return result.rows || [];
  }

  return workflowRuns
    .filter((run) => run.workflowId === workflowId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
};

const summarizeWorkflowRunError = (run) => {
  const failedStep = (Array.isArray(run?.steps) ? run.steps : []).find((step) => step.status === 'failed') || null;
  const rawError = failedStep?.error ?? failedStep?.output ?? run?.status;
  const errorText = typeof rawError === 'string' ? rawError : JSON.stringify(sanitizeWorkflowLogValue(rawError, {maxDepth: 3, maxStringLength: 500}));
  return {
    failedNodeName: failedStep?.nodeName || failedStep?.nodeId || '',
    failedNodeType: failedStep?.type || '',
    errorText: String(errorText || '').slice(0, 500),
  };
};

const dispatchWorkflowRunAlert = async (workflow, run, policy, reasons, metrics) => {
  const errorSummary = summarizeWorkflowRunError(run);
  const title = `Workflow alert: ${workflow.name}`;
  const messageParts = [
    reasons.join('; '),
    `Run ${run.id}`,
    `Status ${run.status}`,
    errorSummary.failedNodeName ? `Failed node ${errorSummary.failedNodeName}` : '',
    errorSummary.errorText ? `Error ${errorSummary.errorText}` : '',
  ].filter(Boolean);
  const notificationPayload = {
    title,
    message: messageParts.join(' | '),
    level: run.status === 'failed' ? 'Critical' : 'Warning',
    source: `workflow-alert:${workflow.id}`,
    workflowId: workflow.id,
    workflowName: workflow.name,
    runId: run.id,
    reasons,
    metrics,
    failedNodeName: errorSummary.failedNodeName,
    createdAt: new Date().toISOString(),
  };

  const notification = policy.notifySystem === false
    ? notificationPayload
    : await persistSystemNotification(notificationPayload);

  const channelResults = [];
  if (policy.notifyChannels) {
    const state = await getDashboardState();
    const channels = Array.isArray(state.notificationChannels) ? state.notificationChannels : [];
    for (const channel of channels.filter((item) => item.enabled)) {
      try {
        channelResults.push({channelId: channel.id, channelName: channel.name, ...(await sendNotificationToChannel(channel, notification))});
      } catch (error) {
        channelResults.push({channelId: channel.id, channelName: channel.name, ok: false, message: error.message});
      }
    }
  }

  return {notification, channels: channelResults};
};

const evaluateWorkflowRunAlert = async (workflow, run) => {
  const policy = workflow?.runAlerting || {};
  if (!policy.enabled) return null;

  const windowSize = Math.max(1, Math.min(100, Number(policy.failureRateWindow || 10)));
  const recentLimit = Math.max(windowSize, Number(policy.consecutiveFailures || 1), 10);
  const recentRuns = await loadRecentWorkflowRuns(workflow.id, recentLimit);
  const orderedRuns = recentRuns.length > 0 ? recentRuns : [run];
  const reasons = [];

  if (policy.notifyOnFailure && run.status === 'failed') {
    reasons.push('current run failed');
  }

  const consecutiveThreshold = Number(policy.consecutiveFailures || 0);
  let normalizedConsecutiveFailures = 0;
  for (const item of orderedRuns) {
    if (item.status !== 'failed') break;
    normalizedConsecutiveFailures += 1;
  }
  if (consecutiveThreshold > 0 && normalizedConsecutiveFailures >= consecutiveThreshold) {
    reasons.push(`consecutive failures ${normalizedConsecutiveFailures}/${consecutiveThreshold}`);
  }

  const failureRateThreshold = Number(policy.failureRatePercent || 0);
  const rateRuns = orderedRuns.slice(0, windowSize);
  const failureRate = rateRuns.length > 0
    ? Math.round((rateRuns.filter((item) => item.status === 'failed').length / rateRuns.length) * 100)
    : 0;
  if (failureRateThreshold > 0 && rateRuns.length >= Math.min(windowSize, 2) && failureRate >= failureRateThreshold) {
    reasons.push(`failure rate ${failureRate}% over last ${rateRuns.length} runs`);
  }

  const avgDurationMs = rateRuns.length > 0
    ? rateRuns.reduce((sum, item) => sum + getWorkflowRunDurationMs(item), 0) / rateRuns.length
    : getWorkflowRunDurationMs(run);
  const avgDurationThreshold = Number(policy.avgDurationMs || 0);
  if (avgDurationThreshold > 0 && avgDurationMs >= avgDurationThreshold) {
    reasons.push(`average duration ${Math.round(avgDurationMs)}ms >= ${avgDurationThreshold}ms`);
  }

  const runDurationMs = getWorkflowRunDurationMs(run);
  const timeoutThreshold = Number(policy.timeoutMs || 0);
  if (timeoutThreshold > 0 && runDurationMs >= timeoutThreshold) {
    reasons.push(`run duration ${runDurationMs}ms >= ${timeoutThreshold}ms`);
  }

  if (reasons.length === 0) return null;

  const cooldownMs = Math.max(0, Number(policy.cooldownMinutes || 0)) * 60 * 1000;
  const cooldownKey = `${workflow.id}:${reasons.join('|')}`;
  const lastSent = workflowAlertLastSent.get(cooldownKey) || 0;
  if (cooldownMs > 0 && Date.now() - lastSent < cooldownMs) return null;
  workflowAlertLastSent.set(cooldownKey, Date.now());

  return dispatchWorkflowRunAlert(workflow, run, policy, reasons, {
    consecutiveFailures: normalizedConsecutiveFailures,
    failureRate,
    windowSize: rateRuns.length,
    avgDurationMs: Math.round(avgDurationMs),
    runDurationMs,
  });
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

const workflowReferencePattern = String.raw`\$\.(?:([A-Za-z0-9_$\u4e00-\u9fa5-]+)\.)?(input|output|status|nodeId|type)(?:\.([A-Za-z0-9_$\u4e00-\u9fa5.-]+))?`;
const workflowReferenceRegex = new RegExp(`^${workflowReferencePattern}$`);
const workflowReferenceTokenRegex = new RegExp(workflowReferencePattern, 'g');
const workflowFunctionNames = new Set(['now', 'formatDate', 'toNumber', 'round', 'contains', 'default', 'upper', 'lower']);
const workflowFunctionArity = {
  now: [0, 0],
  formatDate: [1, 2],
  toNumber: [1, 1],
  round: [1, 2],
  contains: [2, 2],
  default: [2, 2],
  upper: [1, 1],
  lower: [1, 1],
};

const resolveWorkflowReference = (expression, context, currentNodeName) => {
  const match = String(expression || '').trim().match(workflowReferenceRegex);
  if (!match) return undefined;
  const [, explicitNodeName, section, pathExpression] = match;
  const nodeName = explicitNodeName || currentNodeName;
  if (!nodeName) return undefined;
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

const splitWorkflowFunctionArgs = (argsText = '') => {
  const args = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (let index = 0; index < argsText.length; index += 1) {
    const char = argsText[index];
    const previous = argsText[index - 1];
    if (quote) {
      current += char;
      if (char === quote && previous !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() || argsText.trim()) args.push(current.trim());
  return args;
};

const parseWorkflowFunctionCall = (expression) => {
  const text = String(expression || '').trim();
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)$/);
  if (!match) return null;
  return {name: match[1], args: splitWorkflowFunctionArgs(match[2])};
};

const formatWorkflowDate = (value, format = 'iso') => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number, length = 2) => String(number).padStart(length, '0');
  const tokens = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  if (format === 'iso') return date.toISOString();
  if (format === 'date') return `${tokens.YYYY}-${tokens.MM}-${tokens.DD}`;
  if (format === 'time') return `${tokens.HH}:${tokens.mm}:${tokens.ss}`;
  return String(format).replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => tokens[token]);
};

const evaluateWorkflowFunction = (name, args) => {
  switch (name) {
    case 'now':
      return new Date().toISOString();
    case 'formatDate':
      return formatWorkflowDate(args[0], args[1] || 'iso');
    case 'toNumber': {
      const number = Number(args[0]);
      return Number.isFinite(number) ? number : 0;
    }
    case 'round': {
      const decimals = Math.max(0, Math.min(Number(args[1] ?? 0) || 0, 10));
      const factor = 10 ** decimals;
      return Math.round((Number(args[0]) || 0) * factor) / factor;
    }
    case 'contains':
      return String(args[0] ?? '').includes(String(args[1] ?? ''));
    case 'default':
      return args[0] === undefined || args[0] === null || args[0] === '' ? args[1] : args[0];
    case 'upper':
      return String(args[0] ?? '').toUpperCase();
    case 'lower':
      return String(args[0] ?? '').toLowerCase();
    default:
      return undefined;
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
  const referenceValue = resolveWorkflowReference(pathExpression, scope.context || {}, scope.currentNodeName);
  if (referenceValue !== undefined) return referenceValue;
  return getObjectPath(scope, pathExpression);
};

const resolveWorkflowFunctionCall = (expression, context, currentNodeName) => {
  const call = parseWorkflowFunctionCall(expression);
  if (!call || !workflowFunctionNames.has(call.name)) return undefined;
  const args = call.args.map((arg) => {
    const trimmed = String(arg || '').trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1).replace(/\\(["'])/g, '$1');
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    const directReference = resolveWorkflowReference(trimmed, context, currentNodeName);
    if (directReference !== undefined) return directReference;
    if (workflowReferenceRegex.test(trimmed)) return undefined;
    const nestedFunction = resolveWorkflowFunctionCall(trimmed, context, currentNodeName);
    if (nestedFunction !== undefined) return nestedFunction;
    return resolveWorkflowValue(trimmed, context, currentNodeName);
  });
  return evaluateWorkflowFunction(call.name, args);
};

const resolveWorkflowValue = (value, context, currentNodeName) => {
  if (typeof value === 'string') {
    const wholeReference = resolveWorkflowReference(value, context, currentNodeName);
    if (wholeReference !== undefined) return wholeReference;

    const wholeFunction = resolveWorkflowFunctionCall(value, context, currentNodeName);
    if (wholeFunction !== undefined) return wholeFunction;

    return value.replace(workflowReferenceTokenRegex, (match) => {
      const resolved = resolveWorkflowReference(match, context, currentNodeName);
      if (resolved === undefined) return match;
      return stringifyReferenceValue(resolved);
    }).replace(/\b(now|formatDate|toNumber|round|contains|default|upper|lower)\(([^()]*)\)/g, (match) => {
      const resolved = resolveWorkflowFunctionCall(match, context, currentNodeName);
      if (resolved === undefined) return match;
      return stringifyReferenceValue(resolved);
    });
  }

  if (Array.isArray(value)) return value.map((item) => resolveWorkflowValue(item, context, currentNodeName));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveWorkflowValue(item, context, currentNodeName)]));
  }

  return value;
};

const createWorkflowNodeInput = (node, event, context, currentNodeName = normalizeWorkflowNodeName(node, node?.id)) => {
  const upstream = context.__lastOutput;
  const upstreamObject = upstream && typeof upstream === 'object' && !Array.isArray(upstream)
    ? upstream
    : upstream !== undefined
      ? {value: upstream}
      : {};

  return {
    ...upstreamObject,
    config: resolveWorkflowValue(node.config || {}, context, currentNodeName),
    event,
    ...(upstream !== undefined ? {previous: sanitizeWorkflowLogValue(upstream)} : {}),
  };
};

const createWorkflowTriggerOutput = (trigger, event) => {
  if (trigger?.config?.type === 'access' || trigger?.config?.type === 'nfc_access') {
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

  const isConditionStep = step.output
    && typeof step.output === 'object'
    && ('passed' in step.output || ['if', 'elif', 'else', 'switch', 'case', 'default'].includes(step.type));
  if (!isConditionStep && step.status !== 'skipped') {
    context.__lastOutput = sanitizeWorkflowLogValue(step.output);
  }
};

const parseWorkflowDurationMs = (value, maxMs = 30000) => {
  const text = String(value || '0').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  const multiplier = unit === 'm' ? 60000 : unit === 's' ? 1000 : 1;
  return Math.max(0, Math.min(amount * multiplier, maxMs));
};

const parseWorkflowRetryInterval = (value) => parseWorkflowDurationMs(value, 30000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withWorkflowTimeout = async (promise, timeoutMs, label = 'Workflow node') => {
  if (!timeoutMs) return promise;
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const getNodeExecutionPolicy = (node) => ({
  retryEnabled: Boolean(node?.config?.executionPolicy?.retryEnabled),
  retryAttempts: Math.max(1, Math.min(Number(node?.config?.executionPolicy?.retryAttempts || 1) || 1, 10)),
  retryInterval: node?.config?.executionPolicy?.retryInterval || '0s',
  retryBackoff: ['fixed', 'exponential'].includes(node?.config?.executionPolicy?.retryBackoff)
    ? node.config.executionPolicy.retryBackoff
    : 'fixed',
  timeout: node?.config?.executionPolicy?.timeout || '',
  onFailure: ['continue', 'stop'].includes(node?.config?.executionPolicy?.onFailure)
    ? node.config.executionPolicy.onFailure
    : 'stop',
});

const executeWorkflowAction = async (workflow, action, event, context = {}, nodeName = normalizeWorkflowNodeName(action, action.id), options = {}) => {
  const input = createWorkflowNodeInput(action, event, context, nodeName);
  const rawConfig = action.config || {};
  let config = input.config || {};
  const runtimeContext = {
    ...context,
    [nodeName]: {
      ...(context[nodeName] || {}),
      nodeId: action.id,
      type: config.type || action.type,
      status: 'running',
      input: sanitizeWorkflowLogValue(input),
    },
  };
  config = resolveWorkflowValue(config, runtimeContext, nodeName);
  input.config = config;
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
    if (options.dryRun) {
      return {...baseStep, output: {dryRun: true, action: 'webhook', method: 'POST', url}};
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
    const resolved = expression ? resolveWorkflowValue(expression, runtimeContext, nodeName) : runtimeContext;
    const contextSnapshot = sanitizeWorkflowLogValue(runtimeContext);
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
      setObjectPath(base, pathExpression, resolveWorkflowValue(assignmentValue, runtimeContext, nodeName));
    });
    return {...baseStep, output: base};
  }

  if (config.type === 'run_workflow') {
    const workflowSource = config.workflowSource || 'static';
    const targetWorkflowId = workflowSource === 'expression'
      ? resolveWorkflowValue(rawConfig.workflowExpression || config.workflowExpression, runtimeContext, nodeName)
      : config.workflowId;
    const maxDepth = Math.max(1, Math.min(Number(config.maxDepth || options.maxSubWorkflowDepth || 5) || 5, 20));
    const depth = Number(options.subWorkflowDepth || 0) + 1;
    const callStack = Array.isArray(options.callStack) && options.callStack.length > 0 ? options.callStack : [workflow.id];

    if (!targetWorkflowId) {
      return {...baseStep, status: 'failed', output: 'Run Workflow requires a target workflow.'};
    }
    if (depth > maxDepth) {
      return {...baseStep, status: 'failed', output: `Sub-workflow depth exceeded maxDepth ${maxDepth}.`};
    }

    const workflows = await getDashboardWorkflows();
    const targetWorkflow = workflows.find((item) => item.id === targetWorkflowId);
    if (!targetWorkflow) {
      return {...baseStep, status: 'failed', output: `Target workflow ${targetWorkflowId} was not found.`};
    }
    if (callStack.includes(targetWorkflow.id)) {
      return {...baseStep, status: 'failed', output: `Sub-workflow recursion detected: ${[...callStack, targetWorkflow.id].join(' -> ')}.`};
    }

    const executableWorkflow = getExecutableWorkflow(targetWorkflow);
    if (!Array.isArray(executableWorkflow.edges) || executableWorkflow.edges.length === 0) {
      return {...baseStep, status: 'failed', output: 'Target workflow must be saved with graph edges before it can be called as a sub-workflow.'};
    }
    const targetTrigger = config.triggerId
      ? executableWorkflow.nodes?.find((node) => node.id === config.triggerId && node.type === 'trigger')
      : executableWorkflow.nodes?.find((node) => node.type === 'trigger');
    if (!targetTrigger) {
      return {...baseStep, status: 'failed', output: 'Target workflow has no trigger node to start from.'};
    }

    const payloadSource = config.payloadSource || 'json';
    const payloadTemplate = payloadSource === 'expression'
      ? (rawConfig.payloadExpression || config.payloadExpression || '$.input')
      : parseJsonConfig(rawConfig.payloadJson ?? rawConfig.payload ?? '{}', {});
    const payload = resolveWorkflowValue(payloadTemplate, runtimeContext, nodeName);
    const childEvent = {
      type: 'sub_workflow',
      source: 'workflow',
      parentWorkflowId: workflow.id,
      parentWorkflowName: workflow.name,
      parentNodeId: action.id,
      parentNodeName: nodeName,
      payload,
      message: payload && typeof payload === 'object' ? payload : {value: payload},
      receivedAt: new Date().toISOString(),
    };

    const childRun = await executeWorkflow(executableWorkflow, targetTrigger, childEvent, {
      ...options,
      dryRun: Boolean(options.dryRun),
      callStack: [...callStack, targetWorkflow.id],
      subWorkflowDepth: depth,
      maxSubWorkflowDepth: maxDepth,
    });
    const childSteps = Array.isArray(childRun?.steps) ? childRun.steps : [];
    const lastChildStep = childSteps[childSteps.length - 1] || null;
    const childStatus = childRun?.status || 'unknown';
    return {
      ...baseStep,
      status: ['failed', 'stopped'].includes(childStatus) ? 'failed' : 'success',
      output: {
        dryRun: Boolean(options.dryRun),
        action: 'run_workflow',
        workflowId: targetWorkflow.id,
        workflowName: executableWorkflow.name || targetWorkflow.name,
        workflowVersion: executableWorkflow.runningVersion || targetWorkflow.publishedVersion || targetWorkflow.draftVersion || 1,
        runId: childRun?.id,
        status: childStatus,
        triggerId: targetTrigger.id,
        payload,
        result: lastChildStep?.output,
        steps: childSteps,
      },
    };
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
    const scope = {input, event, context: runtimeContext, config, currentNodeName: nodeName};
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
    const rawBody = config.body ? resolveWorkflowValue(config.body, runtimeContext, nodeName) : undefined;
    const bodyValue = typeof rawBody === 'string' ? parseJsonConfig(rawBody, rawBody) : rawBody;
    if (options.dryRun) {
      return {
        ...baseStep,
        output: {
          dryRun: true,
          action: 'http_request',
          method: config.method || 'POST',
          url: config.url,
          headers,
          body: bodyValue ?? {workflow: workflow.id, event},
        },
      };
    }
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
    const scope = {input, event, context: runtimeContext, config, currentNodeName: nodeName};
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
    if (options.dryRun) {
      return {
        ...baseStep,
        output: {
          dryRun: true,
          action: 'mqtt_publish',
          deviceId: resolveWorkflowValue(config.targetExpression || config.deviceExpression || config.target, runtimeContext, nodeName) || event.deviceId || event.device?.id,
          topic: config.topic,
          payload: config.payload,
        },
      };
    }
    const command = await createDeviceControlCommand({
      deviceId: resolveWorkflowValue(config.targetExpression || config.deviceExpression || config.target, runtimeContext, nodeName) || event.deviceId || event.device?.id,
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
      ? resolveWorkflowValue(config.deviceExpression, runtimeContext, nodeName)
      : resolveWorkflowValue(config.device || config.target || config.deviceExpression, runtimeContext, nodeName);
    if (options.dryRun) {
      return {
        ...baseStep,
        output: {
          dryRun: true,
          action: 'device_control',
          deviceId: resolvedDeviceId || event.deviceId || event.device?.id,
          command: config.controlId || config.command || 'device_control',
          parameters: config.parameters && typeof config.parameters === 'object' ? config.parameters : {value: config.value},
        },
      };
    }
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
    if (options.dryRun) {
      return {
        ...baseStep,
        output: {
          dryRun: true,
          action: config.type,
          deviceId: resolveWorkflowValue(config.targetExpression || config.deviceExpression || config.target, runtimeContext, nodeName) || event.deviceId || event.device?.id,
        },
      };
    }
    const command = await createDeviceControlCommand({
      deviceId: resolveWorkflowValue(config.targetExpression || config.deviceExpression || config.target, runtimeContext, nodeName) || event.deviceId || event.device?.id,
      command: config.type,
      parameters: {triggerEvent: event.type},
      requestedBy: `Workflow: ${workflow.name}`,
      requestedByRole: 'Workflow',
      source: `workflow:${workflow.id}`,
    });
    return {...baseStep, status: command.status, output: {commandId: command.id, command: command.command, status: command.status, result: command.result}};
  }

  if (config.type === 'notification') {
    if (options.dryRun) {
      return {
        ...baseStep,
        output: {
          dryRun: true,
          action: 'notification',
          title: config.title || 'System Notification',
          message: config.message || '',
          level: config.level || 'Info',
        },
      };
    }
    const result = await dispatchWorkflowNotification(workflow, config, event);
    return {
      ...baseStep,
      status: 'success',
      output: {
        message: config.message || '',
        notification: result.notification,
        channels: result.channels,
      },
    };
  }

  if (config.type === 'report') {
    const reportOptions = {
      name: config.name || config.title || '',
      content: config.content || config.reportContent || 'Energy',
      range: config.range || config.frequency || 'weekly',
      siteId: config.siteId || event.siteId || event.device?.siteId || 'All',
      deviceIds: Array.isArray(config.deviceIds) ? config.deviceIds : [],
      recipient: config.recipient || '',
      source: 'workflow',
      workflowId: workflow.id,
      workflowName: workflow.name,
    };
    if (options.dryRun) {
      return {
        ...baseStep,
        output: {
          dryRun: true,
          action: 'report',
          report: reportOptions,
        },
      };
    }
    const report = await createGeneratedReport(reportOptions);
    return {
      ...baseStep,
      status: 'success',
      output: {
        reportId: report.id,
        name: report.name,
        content: report.content,
        range: report.range,
        siteId: report.siteId,
        size: report.size,
        recipient: report.recipient,
        result: 'Report generated and saved.',
      },
    };
  }

  if (['email', 'whatsapp', 'ticket', 'ai_analyze'].includes(config.type)) {
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

const executeWorkflowActionWithPolicy = async (workflow, action, event, context = {}, nodeName = normalizeWorkflowNodeName(action, action.id), options = {}) => {
  const policy = getNodeExecutionPolicy(action);
  const totalAttempts = policy.retryEnabled ? policy.retryAttempts : 1;
  const retryIntervalMs = parseWorkflowRetryInterval(policy.retryInterval);
  const timeoutMs = parseWorkflowDurationMs(policy.timeout, 120000);
  const attempts = [];
  let lastStep = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const step = await withWorkflowTimeout(
        executeWorkflowAction(workflow, action, event, context, nodeName, options),
        timeoutMs,
        `Workflow node ${nodeName}`
      );
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
        input: createWorkflowNodeInput(action, event, context, nodeName),
        output: error.message,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    }

    if (attempt < totalAttempts && retryIntervalMs > 0) {
      const backoffFactor = policy.retryBackoff === 'exponential' ? 2 ** (attempt - 1) : 1;
      await sleep(Math.min(retryIntervalMs * backoffFactor, 120000));
    }
  }

  if (!lastStep) return executeWorkflowAction(workflow, action, event, context, nodeName, options);

  if (policy.retryEnabled || lastStep.status === 'failed' || timeoutMs > 0) {
    lastStep = {
      ...lastStep,
      output: {
        result: lastStep.output,
        executionPolicy: {
          retryEnabled: policy.retryEnabled,
          retryAttempts: totalAttempts,
          retryInterval: policy.retryInterval,
          retryBackoff: policy.retryBackoff,
          timeout: policy.timeout,
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

const executeWorkflowWithEdges = async (workflow, trigger, event, startedAt, options = {}) => {
  const dryRun = Boolean(options.dryRun);
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
    const run = {
      id: createId('wfr'),
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowVersion: workflow.runningVersion || workflow.publishedVersion || workflow.draftVersion || 1,
      triggerType: trigger.config?.type || 'unknown',
      eventSource: event.source || event.type,
      status,
      event,
      steps,
      startedAt,
      finishedAt,
      dryRun,
    };
    if (!dryRun) {
      completeWorkflowLiveState(workflow, status, steps);
      await persistWorkflowRun(run, workflow);
    }
    return sanitizeWorkflowLogValue(run);
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
      if (!dryRun) appendWorkflowLiveStep(workflow, step);
      return persistResult('failed');
    }
    visited.add(currentNode.id);

    const outgoing = outgoingEdges.get(currentNode.id) || [];
    const nodeName = nodeNamesById.get(currentNode.id) || normalizeWorkflowNodeName(currentNode, currentNode.id);
    if (!dryRun) updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: currentNode.id});

    if (currentNode.type === 'trigger') {
      const input = createWorkflowNodeInput(currentNode, event, context, nodeName);
      const output = createWorkflowTriggerOutput(currentNode, event);
      const step = {
        nodeId: currentNode.id,
        nodeName,
        type: currentNode.config?.type || 'trigger',
        status: 'success',
        input,
        output,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      steps.push(step);
      recordWorkflowNodeResult(context, nodeName, step);
      if (!dryRun) appendWorkflowLiveStep(workflow, step);
      const nextEdge = outgoing.find((edge) => edge.type === 'next') || outgoing[0];
      currentNode = nodesById.get(nextEdge?.target);
      continue;
    }

    if (currentNode.type === 'condition') {
      const input = createWorkflowNodeInput(currentNode, event, context, nodeName);
      const passed = conditionMatchesEvent(currentNode, event, context, nodeName);
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
      if (!dryRun) appendWorkflowLiveStep(workflow, step);

      const nextEdge = passed
        ? outgoing.find((edge) => edge.type === 'true' || edge.type === 'next')
        : outgoing.find((edge) => edge.type === 'false');

      if (!nextEdge && !passed) {
        return persistResult('skipped');
      }

      currentNode = nodesById.get(nextEdge?.target);
      continue;
    }

    if (currentNode.type === 'action') {
      try {
        const step = await executeWorkflowActionWithPolicy(workflow, currentNode, event, context, nodeName, options);
        steps.push(step);
        recordWorkflowNodeResult(context, nodeName, step);
        if (!dryRun) appendWorkflowLiveStep(workflow, step);
        if (step.status === 'stopped') {
          return persistResult('stopped');
        }
        if (shouldStopWorkflowAfterAction(currentNode, step)) {
          return persistResult('failed');
        }
      } catch (error) {
        const input = createWorkflowNodeInput(currentNode, event, context, nodeName);
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
        if (!dryRun) appendWorkflowLiveStep(workflow, step);
        if (shouldStopWorkflowAfterAction(currentNode, step)) {
          return persistResult('failed');
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
    if (!dryRun) appendWorkflowLiveStep(workflow, step);
    return persistResult('failed');
  }

  return persistResult(steps.some((step) => step.status === 'failed') ? 'failed' : steps.some((step) => step.status === 'stopped') ? 'stopped' : 'success');
};

const executeWorkflow = async (workflow, trigger, event, options = {}) => {
  const startedAt = new Date().toISOString();
  if (!options.dryRun) updateWorkflowLiveState(workflow, {
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
    return executeWorkflowWithEdges(workflow, trigger, event, startedAt, options);
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
  const triggerStep = {
    nodeId: trigger.id,
    nodeName: triggerName,
    type: trigger.config?.type || 'trigger',
    status: 'success',
    input: createWorkflowNodeInput(trigger, event, context, triggerName),
    output: triggerOutput,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  steps.push(triggerStep);
  recordWorkflowNodeResult(context, triggerName, triggerStep);
  appendWorkflowLiveStep(workflow, triggerStep);

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
          const input = createWorkflowNodeInput(condition, event, context, nodeName);
          const switchRuntimeContext = {
            ...context,
            [nodeName]: {
              ...(context[nodeName] || {}),
              nodeId: condition.id,
              type: input.config?.type || condition.type,
              status: 'running',
              input: sanitizeWorkflowLogValue(input),
            },
          };
          input.config = resolveWorkflowValue(input.config || {}, switchRuntimeContext, nodeName);
          const step = {
            nodeId: condition.id,
            nodeName,
            type: condition.config?.type || 'condition',
            status: 'success',
            input,
            output: {
              passed: true,
              branch: condition.config?.type || 'switch',
              value: getWorkflowScopedValue(input.config?.property || 'event.message.status', {input, event, context: switchRuntimeContext, config: input.config || {}, currentNodeName: nodeName}),
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
          const input = createWorkflowNodeInput(condition, event, context, nodeName);
          const passed = conditionMatchesEvent(condition, event, context, nodeName);
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
            workflowVersion: workflow.runningVersion || workflow.publishedVersion || workflow.draftVersion || 1,
            triggerType: trigger.config?.type || 'unknown',
            eventSource: event.source || event.type,
            status: 'skipped',
            event,
            steps,
            startedAt,
            finishedAt,
          }, workflow);
          return;
        }

        selectedActions.push(...matchedBranch.actions);
        continue;
      }

      if (node.type === 'condition') {
        const nodeName = nodeNamesById.get(node.id) || normalizeWorkflowNodeName(node, node.id);
        updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: node.id});
        const input = createWorkflowNodeInput(node, event, context, nodeName);
        const passed = conditionMatchesEvent(node, event, context, nodeName);
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
            workflowVersion: workflow.runningVersion || workflow.publishedVersion || workflow.draftVersion || 1,
            triggerType: trigger.config?.type || 'unknown',
            eventSource: event.source || event.type,
            status: 'skipped',
            event,
            steps,
            startedAt,
            finishedAt,
          }, workflow);
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
        const input = createWorkflowNodeInput(action, event, context, nodeName);
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
      workflowVersion: workflow.runningVersion || workflow.publishedVersion || workflow.draftVersion || 1,
      triggerType: trigger.config?.type || 'unknown',
      eventSource: event.source || event.type,
      status: steps.some((step) => step.status === 'failed') ? 'failed' : steps.some((step) => step.status === 'stopped') ? 'stopped' : 'success',
      event,
      steps,
      startedAt,
      finishedAt,
    }, workflow);
    return;
  }

  const conditions = nonTriggerNodes.filter((node) => node.type === 'condition');
  const actions = nonTriggerNodes.filter((node) => node.type === 'action');

  for (const condition of conditions) {
    const nodeName = nodeNamesById.get(condition.id) || normalizeWorkflowNodeName(condition, condition.id);
    updateWorkflowLiveState(workflow, {status: 'running', currentNodeId: condition.id});
    const input = createWorkflowNodeInput(condition, event, context, nodeName);
    const passed = conditionMatchesEvent(condition, event, context, nodeName);
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
        workflowVersion: workflow.runningVersion || workflow.publishedVersion || workflow.draftVersion || 1,
        triggerType: trigger.config?.type || 'unknown',
        eventSource: event.source || event.type,
        status: 'skipped',
        event,
        steps,
        startedAt,
        finishedAt,
      }, workflow);
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
      const input = createWorkflowNodeInput(action, event, context, nodeName);
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
    workflowVersion: workflow.runningVersion || workflow.publishedVersion || workflow.draftVersion || 1,
    triggerType: trigger.config?.type || 'unknown',
    eventSource: event.source || event.type,
    status: steps.some((step) => step.status === 'failed') ? 'failed' : steps.some((step) => step.status === 'stopped') ? 'stopped' : 'success',
    event,
    steps,
    startedAt,
    finishedAt,
  }, workflow);
};

const workflowQueuePending = [];
const workflowQueueRunning = new Map();
const workflowQueueWorkerId = createId('wf-worker');
const workflowQueueStats = {
  mode: workflowQueueMode,
  adapter: 'memory',
  enqueued: 0,
  started: 0,
  completed: 0,
  failed: 0,
  rejected: 0,
  lastEnqueuedAt: null,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastFailedAt: null,
  lastError: '',
};

const getWorkflowQueueAdapter = () => {
  if (workflowQueueMode === 'postgres' || workflowQueueMode === 'postgresql' || workflowQueueMode === 'database') {
    return db ? 'postgres' : 'memory-fallback';
  }
  if (workflowQueueMode === 'redis' || workflowQueueMode === 'bullmq') return 'memory-fallback';
  return 'memory';
};

const workflowQueueNote = (adapter) => {
  if (adapter === 'postgres') return 'PostgreSQL durable workflow queue is active.';
  if (adapter === 'memory-fallback') {
    return workflowQueueMode === 'postgres' || workflowQueueMode === 'postgresql' || workflowQueueMode === 'database'
      ? 'WORKFLOW_QUEUE_MODE requested PostgreSQL, but DATABASE_URL is not configured. Using the in-process queue.'
      : 'WORKFLOW_QUEUE_MODE requested Redis/BullMQ, but this build uses the in-process queue until the Redis adapter is installed.';
  }
  return 'In-process workflow queue is active.';
};

const workflowQueueStatus = async () => {
  const adapter = getWorkflowQueueAdapter();
  workflowQueueStats.adapter = adapter;
  const baseStatus = {
    ...workflowQueueStats,
    adapter,
    configuredMode: workflowQueueMode,
    workerId: workflowQueueWorkerId,
    concurrency: workflowQueueConcurrency,
    maxPending: workflowQueueMaxPending,
    maxAttempts: workflowQueueMaxAttempts,
    staleMs: workflowQueueStaleMs,
    pending: workflowQueuePending.length,
    running: workflowQueueRunning.size,
    note: workflowQueueNote(adapter),
  };

  if (adapter !== 'postgres') return baseStatus;

  const result = await queryDb(`
    SELECT status, count(*)::int AS count
    FROM workflow_queue_jobs
    GROUP BY status
  `);
  const counts = Object.fromEntries((result?.rows || []).map((row) => [row.status, Number(row.count || 0)]));
  return {
    ...baseStatus,
    pending: counts.pending || 0,
    running: counts.running || 0,
    completed: counts.completed ?? baseStatus.completed,
    failed: counts.failed ?? baseStatus.failed,
    databaseCounts: counts,
  };
};

const enqueueWorkflowRun = async ({workflow, trigger, event, reason = 'event'} = {}) => {
  if (!workflow || !trigger || !event) return {queued: false, reason: 'invalid_job'};
  const sanitizedEvent = sanitizeWorkflowLogValue(event, {maxDepth: 8, maxArrayLength: 200, maxStringLength: 4000});
  const adapter = getWorkflowQueueAdapter();

  if (adapter === 'postgres') {
    const countResult = await queryDb(
      `SELECT count(*)::int AS count FROM workflow_queue_jobs WHERE status = 'pending'`
    );
    if (Number(countResult?.rows?.[0]?.count || 0) >= workflowQueueMaxPending) {
      workflowQueueStats.rejected += 1;
      workflowQueueStats.lastError = `PostgreSQL workflow queue is full (${workflowQueueMaxPending} pending jobs).`;
      console.warn(workflowQueueStats.lastError);
      return {queued: false, reason: 'queue_full'};
    }

    const jobId = createId('wfq');
    const enqueuedAt = new Date().toISOString();
    await queryDb(
      `INSERT INTO workflow_queue_jobs
       (id, workflow_id, workflow_name, trigger_id, reason, status, workflow, trigger, event, enqueued_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb, $7::jsonb, $8::jsonb, $9::timestamptz, $9::timestamptz)`,
      [
        jobId,
        workflow.id,
        workflow.name || '',
        trigger.id,
        reason,
        JSON.stringify(workflow),
        JSON.stringify(trigger),
        JSON.stringify(sanitizedEvent),
        enqueuedAt,
      ]
    );
    workflowQueueStats.enqueued += 1;
    workflowQueueStats.lastEnqueuedAt = enqueuedAt;
    void drainWorkflowQueue();
    return {queued: true, jobId, adapter};
  }

  if (workflowQueuePending.length >= workflowQueueMaxPending) {
    workflowQueueStats.rejected += 1;
    workflowQueueStats.lastError = `Workflow queue is full (${workflowQueueMaxPending} pending jobs).`;
    console.warn(workflowQueueStats.lastError);
    return {queued: false, reason: 'queue_full'};
  }

  const job = {
    id: createId('wfq'),
    adapter,
    workflow,
    trigger,
    event: sanitizedEvent,
    reason,
    enqueuedAt: new Date().toISOString(),
  };
  workflowQueuePending.push(job);
  workflowQueueStats.enqueued += 1;
  workflowQueueStats.lastEnqueuedAt = job.enqueuedAt;
  drainWorkflowQueue();
  return {queued: true, jobId: job.id};
};

const claimPostgresWorkflowQueueJob = async () => {
  const staleBefore = new Date(Date.now() - workflowQueueStaleMs).toISOString();
  const result = await queryDb(
    `WITH next_job AS (
       SELECT id
       FROM workflow_queue_jobs
       WHERE (
         status = 'pending'
         OR (status = 'running' AND locked_at < $2::timestamptz)
       )
       AND attempts < $3
       ORDER BY enqueued_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE workflow_queue_jobs AS job
     SET status = 'running',
         locked_by = $1,
         locked_at = now(),
         started_at = COALESCE(started_at, now()),
         attempts = attempts + 1,
         updated_at = now(),
         last_error = NULL
     FROM next_job
     WHERE job.id = next_job.id
     RETURNING job.id, job.workflow_id AS "workflowId", job.workflow_name AS "workflowName",
               job.trigger_id AS "triggerId", job.reason, job.workflow, job.trigger, job.event, job.attempts`,
    [workflowQueueWorkerId, staleBefore, workflowQueueMaxAttempts]
  );
  const row = result?.rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    adapter: 'postgres',
    workflow: row.workflow,
    trigger: row.trigger,
    event: row.event,
    reason: row.reason || 'event',
    attempts: Number(row.attempts || 1),
  };
};

const markExpiredPostgresWorkflowQueueJobs = async () => {
  if (!db || getWorkflowQueueAdapter() !== 'postgres') return;
  const staleBefore = new Date(Date.now() - workflowQueueStaleMs).toISOString();
  await queryDb(
    `UPDATE workflow_queue_jobs
     SET status = 'failed',
         finished_at = now(),
         updated_at = now(),
         last_error = COALESCE(last_error, 'Workflow queue job exceeded max attempts after becoming stale.'),
         locked_by = NULL,
         locked_at = NULL
     WHERE status = 'running'
       AND locked_at < $1::timestamptz
       AND attempts >= $2`,
    [staleBefore, workflowQueueMaxAttempts]
  );
};

const updatePostgresWorkflowQueueJob = async (job, status, error = '') => {
  if (!db || job?.adapter !== 'postgres') return;
  await queryDb(
    `UPDATE workflow_queue_jobs
     SET status = $2,
         finished_at = now(),
         updated_at = now(),
         last_error = $3,
         locked_by = NULL,
         locked_at = NULL
     WHERE id = $1`,
    [job.id, status, error]
  );
};

const runWorkflowQueueJob = async (job) => {
  workflowQueueRunning.set(job.id, job);
  workflowQueueStats.started += 1;
  workflowQueueStats.lastStartedAt = new Date().toISOString();
  try {
    await executeWorkflow(job.workflow, job.trigger, job.event, {queueJobId: job.id, queueReason: job.reason});
    await updatePostgresWorkflowQueueJob(job, 'completed');
    workflowQueueStats.completed += 1;
    workflowQueueStats.lastCompletedAt = new Date().toISOString();
  } catch (error) {
    workflowQueueStats.failed += 1;
    workflowQueueStats.lastFailedAt = new Date().toISOString();
    workflowQueueStats.lastError = error.message || 'Workflow queue job failed.';
    await updatePostgresWorkflowQueueJob(job, 'failed', workflowQueueStats.lastError);
    console.error('Workflow queue job failed:', error);
  } finally {
    workflowQueueRunning.delete(job.id);
    setTimeout(drainWorkflowQueue, workflowQueuePollMs);
  }
};

async function drainWorkflowQueue() {
  if (getWorkflowQueueAdapter() === 'postgres') {
    await markExpiredPostgresWorkflowQueueJobs();
    while (workflowQueueRunning.size < workflowQueueConcurrency) {
      const job = await claimPostgresWorkflowQueueJob();
      if (!job) return;
      void runWorkflowQueueJob(job);
    }
    return;
  }

  while (workflowQueueRunning.size < workflowQueueConcurrency && workflowQueuePending.length > 0) {
    const job = workflowQueuePending.shift();
    void runWorkflowQueueJob(job);
  }
}

const startWorkflowQueueWorker = () => {
  void drainWorkflowQueue();
  if (getWorkflowQueueAdapter() === 'postgres') {
    setInterval(() => {
      drainWorkflowQueue().catch((error) => {
        workflowQueueStats.lastError = error.message || 'Workflow queue drain failed.';
        console.error('Workflow queue drain failed:', error);
      });
    }, workflowQueuePollMs);
  }
};

const testWorkflowNode = async ({workflow, nodeId, event = {}, context = {}}) => {
  if (!workflow || !Array.isArray(workflow.nodes)) {
    throw new Error('Workflow draft is required.');
  }
  const node = workflow.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error('Workflow node not found.');

  const triggerType = node.config?.type || 'test';
  const defaultEventType = node.type === 'trigger'
    ? (['threshold', 'offline', 'alert', 'mqtt_message'].includes(triggerType)
      ? 'telemetry'
      : ['access', 'nfc_access'].includes(triggerType)
        ? 'access'
        : triggerType === 'webhook'
          ? 'webhook'
          : triggerType === 'schedule'
            ? 'schedule'
            : triggerType)
    : 'test';
  const defaultSource = triggerType === 'mqtt_message'
    ? 'mqtt:test'
    : triggerType === 'nfc_access'
      ? 'nfc'
      : 'node-test';
  const testEvent = {
    type: event.type || defaultEventType,
    source: event.source || defaultSource,
    message: {},
    receivedAt: new Date().toISOString(),
    ...event,
  };
  const nodeNamesById = buildWorkflowNodeNameMap(workflow);
  const nodeName = nodeNamesById.get(node.id) || normalizeWorkflowNodeName(node, node.id);

  if (node.type === 'trigger') {
    const input = createWorkflowNodeInput(node, testEvent, context, nodeName);
    const output = createWorkflowTriggerOutput(node, testEvent);
    return {
      nodeId: node.id,
      nodeName,
      type: node.config?.type || 'trigger',
      status: triggerMatchesEvent(node, testEvent) ? 'success' : 'skipped',
      input,
      output,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }

  if (node.type === 'condition') {
    const input = createWorkflowNodeInput(node, testEvent, context, nodeName);
    const passed = conditionMatchesEvent(node, testEvent, context, nodeName);
    return {
      nodeId: node.id,
      nodeName,
      type: node.config?.type || 'condition',
      status: passed ? 'success' : 'skipped',
      input,
      output: {passed, message: passed ? 'Condition passed' : 'Condition did not match test event'},
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }

  return executeWorkflowActionWithPolicy(workflow, node, testEvent, context, nodeName, {dryRun: true});
};

const createWorkflowDryRunEvent = (trigger, event = {}) => {
  const triggerType = trigger?.config?.type || 'test';
  const defaultEventType = ['threshold', 'offline', 'alert', 'mqtt_message'].includes(triggerType)
    ? 'telemetry'
    : ['access', 'nfc_access'].includes(triggerType)
      ? 'access'
      : triggerType === 'webhook'
        ? 'webhook'
        : triggerType === 'schedule'
          ? 'schedule'
          : triggerType;
  const defaultSource = triggerType === 'mqtt_message'
    ? 'mqtt:dry-run'
    : triggerType === 'nfc_access'
      ? 'nfc'
      : triggerType === 'access'
        ? 'qr'
        : 'workflow-dry-run';
  return {
    type: event.type || defaultEventType,
    source: event.source || defaultSource,
    message: {},
    receivedAt: new Date().toISOString(),
    ...event,
  };
};

const dryRunWorkflow = async ({workflow, triggerId, event = {}}) => {
  if (!workflow || !Array.isArray(workflow.nodes)) {
    throw new Error('Workflow draft is required.');
  }
  const triggers = workflow.nodes.filter((node) => node.type === 'trigger');
  if (triggers.length === 0) throw new Error('Workflow requires at least one trigger for dry run.');

  const selectedTrigger = triggerId
    ? triggers.find((node) => node.id === triggerId)
    : triggers.find((node) => triggerMatchesEvent(node, event)) || triggers[0];
  if (!selectedTrigger) throw new Error('Selected trigger was not found.');

  const testEvent = createWorkflowDryRunEvent(selectedTrigger, event);
  const workflowForRun = {
    ...workflow,
    enabled: false,
    runningVersion: workflow.draftVersion || workflow.publishedVersion || 1,
  };

  const run = await executeWorkflowWithEdges(workflowForRun, selectedTrigger, testEvent, new Date().toISOString(), {dryRun: true});
  if (!run) throw new Error('Dry run did not return an execution log. Save or rebuild workflow edges and try again.');
  return run;
};

const createWorkflowValidationIssue = (severity, code, message, node) => ({
  id: createId('wfv'),
  severity,
  code,
  message,
  nodeId: node?.id || '',
  nodeName: node?.name || node?.config?.type || '',
  nodeType: node?.type || '',
});

const validateWorkflowDraft = async (workflow) => {
  if (!workflow || !Array.isArray(workflow.nodes)) {
    return {
      ok: false,
      issues: [createWorkflowValidationIssue('error', 'workflow.invalid', 'Workflow draft is required.')],
      summary: {errors: 1, warnings: 0, info: 0},
    };
  }

  const state = await getDashboardState();
  const devices = Array.isArray(state.devices) ? state.devices : [];
  const accesses = Array.isArray(state.accesses) ? state.accesses : [];
  const notificationChannels = Array.isArray(state.notificationChannels) ? state.notificationChannels : [];
  const workflows = Array.isArray(state.workflows) ? state.workflows : [];
  const deviceIds = new Set(devices.flatMap((device) => [device.id, device.config?.externalDeviceId].filter(Boolean)));
  const accessIds = new Set(accesses.map((access) => access.id));
  const notificationGroupIds = new Set(notificationChannels.map((channel) => channel.groupId || channel.id).filter(Boolean));
  const workflowIds = new Set(workflows.map((item) => item.id));
  const publishedWorkflowIds = new Set(workflows.filter((item) => item.publishedSnapshot && Array.isArray(item.publishedSnapshot.nodes)).map((item) => item.id));
  const issues = [];
  const nodes = workflow.nodes || [];
  const triggers = nodes.filter((node) => node.type === 'trigger');
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const edgeTargets = new Set(edges.map((edge) => edge.target));
  const edgeSources = new Set(edges.map((edge) => edge.source));

  if (triggers.length === 0) {
    issues.push(createWorkflowValidationIssue('error', 'trigger.missing', 'Workflow requires at least one trigger.'));
  }

  if (!workflow.name || !String(workflow.name).trim()) {
    issues.push(createWorkflowValidationIssue('error', 'workflow.name_missing', 'Workflow name is required.'));
  }

  const alertPolicy = workflow.runAlerting || {};
  if (alertPolicy.enabled) {
    if (alertPolicy.notifySystem === false && !alertPolicy.notifyChannels) {
      issues.push(createWorkflowValidationIssue('warning', 'workflow_alert.no_target', 'Run Alerting is enabled but no notification target is selected.'));
    }
    if (alertPolicy.notifyChannels && notificationChannels.filter((channel) => channel.enabled).length === 0) {
      issues.push(createWorkflowValidationIssue('warning', 'workflow_alert.no_channels', 'Run Alerting is configured to send channels, but no notification channel is enabled.'));
    }
    if (!alertPolicy.notifyOnFailure && !Number(alertPolicy.consecutiveFailures || 0) && !Number(alertPolicy.failureRatePercent || 0) && !Number(alertPolicy.avgDurationMs || 0) && !Number(alertPolicy.timeoutMs || 0)) {
      issues.push(createWorkflowValidationIssue('warning', 'workflow_alert.no_rules', 'Run Alerting is enabled but no alert rule is active.'));
    }
  }

  const validateExpressionText = (text, node, fieldPath) => {
    if (typeof text !== 'string' || !text.includes('(')) return;
    const matches = Array.from(text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\(([^()]*)\)/g));
    matches.forEach((match) => {
      const name = match[1];
      if (!workflowFunctionNames.has(name)) {
        if (text.includes('$.')) {
          issues.push(createWorkflowValidationIssue('warning', 'expression.unknown_function', `Unknown expression function "${name}" in ${fieldPath}.`, node));
        }
        return;
      }
      const args = splitWorkflowFunctionArgs(match[2]);
      const [minArgs, maxArgs] = workflowFunctionArity[name] || [0, 99];
      if (args.length < minArgs || args.length > maxArgs) {
        issues.push(createWorkflowValidationIssue('error', 'expression.invalid_args', `${name}() expects ${minArgs === maxArgs ? minArgs : `${minArgs}-${maxArgs}`} argument(s), got ${args.length} in ${fieldPath}.`, node));
      }
    });
  };

  const walkConfigExpressions = (value, node, path = 'config') => {
    if (typeof value === 'string') {
      validateExpressionText(value, node, path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walkConfigExpressions(item, node, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => walkConfigExpressions(item, node, `${path}.${key}`));
    }
  };

  nodes.forEach((node) => {
    const config = node.config || {};
    const configType = config.type || node.type;
    walkConfigExpressions(config, node);

    if (!node.name || !String(node.name).trim()) {
      issues.push(createWorkflowValidationIssue('warning', 'node.name_missing', 'Node has no stable name. Expressions are easier to maintain with named nodes.', node));
    }

    if (node.type !== 'trigger' && triggers.length > 0 && edges.length > 0 && !edgeTargets.has(node.id)) {
      issues.push(createWorkflowValidationIssue('warning', 'node.unreachable', 'Node is not connected from an upstream node and may never execute.', node));
    }

    if (node.type !== 'action' && edges.length > 0 && !edgeSources.has(node.id) && configType !== 'stop_workflow') {
      issues.push(createWorkflowValidationIssue('info', 'node.terminal', 'Node has no outgoing connection.', node));
    }

    if (node.type === 'trigger') {
      if (!config.cooldown && !config.debounce) {
        issues.push(createWorkflowValidationIssue('warning', 'trigger.cooldown_missing', 'Trigger has no cooldown/debounce. Repeated events may start many runs.', node));
      }
      if (configType === 'threshold' && (!config.metric || config.value === undefined || config.value === '')) {
        issues.push(createWorkflowValidationIssue('error', 'threshold.incomplete', 'Threshold trigger requires metric and value.', node));
      }
      if (configType === 'mqtt_message' && !config.topic) {
        issues.push(createWorkflowValidationIssue('warning', 'mqtt.topic_missing', 'MQTT trigger has no topic filter.', node));
      }
      if (configType === 'webhook' && !config.endpoint) {
        issues.push(createWorkflowValidationIssue('error', 'webhook.endpoint_missing', 'Webhook trigger endpoint is missing.', node));
      }
      if (configType === 'schedule') {
        const cronValidation = validateCronExpression(config.crontab || '* * * * *');
        if (!cronValidation.valid) {
          issues.push(createWorkflowValidationIssue('error', 'schedule.cron_invalid', cronValidation.reason, node));
        } else {
          const matchesPerDay = estimateCronMatchesPerDay(config.crontab || '* * * * *');
          if (matchesPerDay > 288) {
            issues.push(createWorkflowValidationIssue('warning', 'schedule.too_frequent', 'Schedule runs more than 288 times per day. Consider increasing the interval.', node));
          }
        }
      }
      if (['access', 'nfc_access'].includes(configType)) {
        if (!config.accessId) {
          issues.push(createWorkflowValidationIssue('error', 'access.not_bound', 'Access trigger must bind an Access entry.', node));
        } else if (accessIds.size > 0 && !accessIds.has(config.accessId)) {
          issues.push(createWorkflowValidationIssue('error', 'access.not_found', 'Bound Access entry does not exist.', node));
        }
      }
    }

    if (node.type === 'condition') {
      if (['if', 'elif'].includes(configType) && !config.metric && !config.expression && !config.status) {
        issues.push(createWorkflowValidationIssue('warning', 'condition.incomplete', 'Condition has no metric, expression, or status to evaluate.', node));
      }
      if (configType === 'case' && (config.value === undefined || config.value === '')) {
        issues.push(createWorkflowValidationIssue('warning', 'case.value_missing', 'Switch case has no match value.', node));
      }
    }

    if (node.type === 'action') {
      if (configType === 'webhook') {
        const url = config.url || config.webhookUrl || config.endpoint || config.target;
        if (!url || !String(url).startsWith('http')) {
          issues.push(createWorkflowValidationIssue('error', 'webhook.url_invalid', 'Webhook action requires a valid http/https URL.', node));
        }
      }
      if (configType === 'http_request') {
        if (!config.url || !String(config.url).startsWith('http')) {
          issues.push(createWorkflowValidationIssue('error', 'http.url_invalid', 'HTTP Request requires a valid http/https URL.', node));
        }
      }
      if (configType === 'notification') {
        if (!config.message) {
          issues.push(createWorkflowValidationIssue('warning', 'notification.message_empty', 'Notification message is empty.', node));
        }
        if (config.groupId && notificationGroupIds.size > 0 && !notificationGroupIds.has(config.groupId)) {
          issues.push(createWorkflowValidationIssue('warning', 'notification.group_missing', 'Notification group does not match any configured notification channel group.', node));
        }
      }
      if (configType === 'device_control') {
        const hasDeviceExpression = config.deviceSource === 'expression' && config.deviceExpression;
        const staticDevice = config.device || config.target;
        if (!hasDeviceExpression && !staticDevice) {
          issues.push(createWorkflowValidationIssue('error', 'device_control.device_missing', 'Device Control action requires a device or device expression.', node));
        } else if (staticDevice && deviceIds.size > 0 && !deviceIds.has(staticDevice)) {
          issues.push(createWorkflowValidationIssue('warning', 'device_control.device_not_found', 'Static device binding does not match any known device.', node));
        }
        if (!config.controlId && !config.command) {
          issues.push(createWorkflowValidationIssue('error', 'device_control.control_missing', 'Device Control action requires a control action ID.', node));
        } else if (!hasDeviceExpression && staticDevice) {
          const device = devices.find((item) => item.id === staticDevice || item.config?.externalDeviceId === staticDevice);
          const definitions = getServerDeviceControlDefinitions(device);
          const command = config.controlId || config.command;
          if (definitions.length > 0 && !definitions.some((definition) => definition.id === command)) {
            issues.push(createWorkflowValidationIssue('error', 'device_control.control_not_found', `Control action ${command} is not configured for the selected device.`, node));
          }
        }
      }
      if (configType === 'mqtt_publish' && !config.topic) {
        issues.push(createWorkflowValidationIssue('error', 'mqtt_publish.topic_missing', 'MQTT Publish action requires a topic.', node));
      }
      if (configType === 'function' && !config.code) {
        issues.push(createWorkflowValidationIssue('warning', 'function.code_empty', 'Function node has no code.', node));
      }
      if (configType === 'run_workflow') {
        const staticWorkflowId = config.workflowSource === 'expression' ? '' : config.workflowId;
        if (config.workflowSource === 'expression') {
          if (!config.workflowExpression) {
            issues.push(createWorkflowValidationIssue('error', 'run_workflow.expression_missing', 'Run Workflow requires a workflow ID expression.', node));
          }
        } else if (!staticWorkflowId) {
          issues.push(createWorkflowValidationIssue('error', 'run_workflow.target_missing', 'Run Workflow requires a target workflow.', node));
        } else if (staticWorkflowId === workflow.id) {
          issues.push(createWorkflowValidationIssue('error', 'run_workflow.self_reference', 'Run Workflow cannot call the current workflow directly.', node));
        } else if (workflowIds.size > 0 && !workflowIds.has(staticWorkflowId)) {
          issues.push(createWorkflowValidationIssue('error', 'run_workflow.target_not_found', 'Target workflow does not exist.', node));
        } else if (workflowIds.size > 0 && !publishedWorkflowIds.has(staticWorkflowId)) {
          issues.push(createWorkflowValidationIssue('warning', 'run_workflow.not_published', 'Target workflow has no published snapshot. Publish it before production use.', node));
        } else {
          const targetWorkflow = workflows.find((item) => item.id === staticWorkflowId);
          const targetEdges = targetWorkflow?.publishedSnapshot?.edges || targetWorkflow?.edges || [];
          if (!Array.isArray(targetEdges) || targetEdges.length === 0) {
            issues.push(createWorkflowValidationIssue('error', 'run_workflow.no_edges', 'Target workflow must be saved with graph edges before it can be called.', node));
          }
        }
        if ((config.payloadSource || 'json') === 'json') {
          try {
            JSON.parse(config.payloadJson || config.payload || '{}');
          } catch (error) {
            issues.push(createWorkflowValidationIssue('error', 'run_workflow.payload_invalid', 'Run Workflow payload JSON is invalid.', node));
          }
        }
      }
      if (['webhook', 'http_request', 'mqtt_publish', 'device_control', 'notification', 'run_workflow'].includes(configType)) {
        issues.push(createWorkflowValidationIssue('info', 'action.external_effect', `This ${configType} action has external side effects during real execution.`, node));
      }
    }
  });

  const summary = issues.reduce((acc, issue) => {
    if (issue.severity === 'error') acc.errors += 1;
    else if (issue.severity === 'warning') acc.warnings += 1;
    else acc.info += 1;
    return acc;
  }, {errors: 0, warnings: 0, info: 0});

  return {
    ok: summary.errors === 0,
    issues,
    summary,
  };
};

const dispatchWorkflowEvent = async (event) => {
  const workflows = await getDashboardWorkflows();
  const enabledWorkflows = workflows.filter((workflow) => workflow?.enabled);
  const queued = [];
  const rejected = [];

  await Promise.all(enabledWorkflows.map(async (workflow) => {
    const executableWorkflow = getExecutableWorkflow(workflow);
    const triggers = executableWorkflow.nodes.filter((node) => node.type === 'trigger');
    const matchedTrigger = triggers.find((trigger) => triggerMatchesEvent(trigger, event));

    if (matchedTrigger && shouldExecuteWorkflowTrigger(executableWorkflow, matchedTrigger, event)) {
      const result = await enqueueWorkflowRun({
        workflow: executableWorkflow,
        trigger: matchedTrigger,
        event,
        reason: event.type || 'event',
      });
      (result.queued ? queued : rejected).push({
        workflowId: executableWorkflow.id,
        workflowName: executableWorkflow.name,
        triggerId: matchedTrigger.id,
        ...result,
      });
    }
  }));

  return {queued, rejected};
};

const runScheduledWorkflows = async () => {
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  if (minuteKey === lastWorkflowScheduleMinute) return;
  lastWorkflowScheduleMinute = minuteKey;

  const workflows = await getDashboardWorkflows();
  const enabledWorkflows = workflows.filter((workflow) => workflow?.enabled);

  for (const workflow of enabledWorkflows) {
    const executableWorkflow = getExecutableWorkflow(workflow);
    const scheduleTrigger = executableWorkflow.nodes.find((node) => (
      node.type === 'trigger'
      && node.config?.type === 'schedule'
      && cronMatchesNow(node.config?.crontab, now)
    ));

    if (!scheduleTrigger) continue;

    const scheduleEvent = {
        type: 'schedule',
        source: 'schedule',
        workflowId: executableWorkflow.id,
        scheduledAt: now.toISOString(),
        crontab: scheduleTrigger.config?.crontab,
    };

    if (shouldExecuteWorkflowTrigger(executableWorkflow, scheduleTrigger, scheduleEvent)) {
      await enqueueWorkflowRun({
        workflow: executableWorkflow,
        trigger: scheduleTrigger,
        event: scheduleEvent,
        reason: 'schedule',
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

const telemetryRollupIntervals = [
  {name: 'minute', ms: 60 * 1000},
  {name: 'hour', ms: 60 * 60 * 1000},
];

const floorTimestampToBucket = (value, bucketMs) => {
  const timestamp = new Date(value || Date.now()).getTime();
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(Math.floor(safeTimestamp / bucketMs) * bucketMs).toISOString();
};

const buildTelemetryRollups = (messages = [], source = 'http') => {
  const rollups = new Map();
  for (const message of messages) {
    const deviceId = message.device_id || message.deviceId || message.id;
    if (!deviceId) continue;
    const siteId = message.site_id || message.siteId || '';
    const metrics = message.metrics || {};
    const receivedAt = message.received_at || new Date().toISOString();
    const receivedMs = new Date(receivedAt).getTime();
    const rollupSource = message.source || source;
    for (const [metric, rawValue] of Object.entries(metrics)) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;
      for (const interval of telemetryRollupIntervals) {
        const bucketStart = floorTimestampToBucket(receivedAt, interval.ms);
        const key = [interval.name, bucketStart, deviceId, metric, rollupSource].join('|');
        const current = rollups.get(key);
        if (!current) {
          rollups.set(key, {
            bucketInterval: interval.name,
            bucketStart,
            deviceId,
            siteId,
            metric,
            source: rollupSource,
            count: 1,
            minValue: value,
            maxValue: value,
            sumValue: value,
            latestValue: value,
            lastReceivedAt: receivedAt,
            lastReceivedMs: Number.isFinite(receivedMs) ? receivedMs : 0,
          });
          continue;
        }
        current.count += 1;
        current.minValue = Math.min(current.minValue, value);
        current.maxValue = Math.max(current.maxValue, value);
        current.sumValue += value;
        if ((Number.isFinite(receivedMs) ? receivedMs : 0) >= current.lastReceivedMs) {
          current.latestValue = value;
          current.lastReceivedAt = receivedAt;
          current.lastReceivedMs = Number.isFinite(receivedMs) ? receivedMs : current.lastReceivedMs;
        }
        if (!current.siteId && siteId) current.siteId = siteId;
      }
    }
  }
  return Array.from(rollups.values());
};

const persistTelemetryRollups = async (messages, source = 'http') => {
  if (!db || messages.length === 0) return;
  const rollups = buildTelemetryRollups(messages, source);
  if (rollups.length === 0) return;

  const values = [];
  const placeholders = rollups.map((rollup, index) => {
    const offset = index * 12;
    values.push(
      rollup.bucketInterval,
      rollup.bucketStart,
      rollup.deviceId,
      rollup.siteId || null,
      rollup.metric,
      rollup.source,
      rollup.count,
      rollup.minValue,
      rollup.maxValue,
      rollup.sumValue,
      rollup.latestValue,
      rollup.lastReceivedAt
    );
    return `($${offset + 1}, $${offset + 2}::timestamptz, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}::timestamptz)`;
  }).join(', ');

  await queryDb(
    `INSERT INTO telemetry_metric_rollups
       (bucket_interval, bucket_start, device_id, site_id, metric, source, count, min_value, max_value, sum_value, latest_value, last_received_at)
     VALUES ${placeholders}
     ON CONFLICT (bucket_interval, bucket_start, device_id, metric, source)
     DO UPDATE SET
       site_id = COALESCE(telemetry_metric_rollups.site_id, EXCLUDED.site_id),
       count = telemetry_metric_rollups.count + EXCLUDED.count,
       min_value = LEAST(telemetry_metric_rollups.min_value, EXCLUDED.min_value),
       max_value = GREATEST(telemetry_metric_rollups.max_value, EXCLUDED.max_value),
       sum_value = telemetry_metric_rollups.sum_value + EXCLUDED.sum_value,
       latest_value = CASE
         WHEN EXCLUDED.last_received_at >= telemetry_metric_rollups.last_received_at THEN EXCLUDED.latest_value
         ELSE telemetry_metric_rollups.latest_value
       END,
       last_received_at = GREATEST(telemetry_metric_rollups.last_received_at, EXCLUDED.last_received_at),
       updated_at = now()`,
    values
  );
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
  await persistTelemetryRollups(messages, source);
};

const telemetryRetentionState = {
  enabled: telemetryRetentionEnabled,
  lastRunAt: null,
  lastError: '',
  deletedRaw: 0,
  deletedMinuteRollups: 0,
  deletedHourRollups: 0,
};

const getTelemetryRetentionStatus = () => ({
  ...telemetryRetentionState,
  rawRetentionDays: telemetryRawRetentionDays,
  minuteRollupRetentionDays: telemetryMinuteRollupRetentionDays,
  hourRollupRetentionDays: telemetryHourRollupRetentionDays,
  intervalMs: telemetryRetentionIntervalMs,
  databaseBacked: Boolean(db),
});

const runTelemetryRetentionCleanup = async () => {
  if (!db || !telemetryRetentionEnabled) return getTelemetryRetentionStatus();
  const rawResult = await queryDb(
    `WITH deleted AS (
       DELETE FROM telemetry_messages
       WHERE received_at < now() - ($1::text || ' days')::interval
       RETURNING 1
     )
     SELECT count(*)::int AS count FROM deleted`,
    [telemetryRawRetentionDays]
  );
  const minuteResult = await queryDb(
    `WITH deleted AS (
       DELETE FROM telemetry_metric_rollups
       WHERE bucket_interval = 'minute'
         AND bucket_start < now() - ($1::text || ' days')::interval
       RETURNING 1
     )
     SELECT count(*)::int AS count FROM deleted`,
    [telemetryMinuteRollupRetentionDays]
  );
  const hourResult = await queryDb(
    `WITH deleted AS (
       DELETE FROM telemetry_metric_rollups
       WHERE bucket_interval = 'hour'
         AND bucket_start < now() - ($1::text || ' days')::interval
       RETURNING 1
     )
     SELECT count(*)::int AS count FROM deleted`,
    [telemetryHourRollupRetentionDays]
  );

  telemetryRetentionState.lastRunAt = new Date().toISOString();
  telemetryRetentionState.lastError = '';
  telemetryRetentionState.deletedRaw = Number(rawResult?.rows?.[0]?.count || 0);
  telemetryRetentionState.deletedMinuteRollups = Number(minuteResult?.rows?.[0]?.count || 0);
  telemetryRetentionState.deletedHourRollups = Number(hourResult?.rows?.[0]?.count || 0);
  return getTelemetryRetentionStatus();
};

const startTelemetryRetentionWorker = () => {
  if (!db || !telemetryRetentionEnabled) return;
  runTelemetryRetentionCleanup().catch((error) => {
    telemetryRetentionState.lastError = error.message || 'Telemetry retention cleanup failed.';
    console.error('Telemetry retention cleanup failed:', error);
  });
  setInterval(() => {
    runTelemetryRetentionCleanup().catch((error) => {
      telemetryRetentionState.lastError = error.message || 'Telemetry retention cleanup failed.';
      console.error('Telemetry retention cleanup failed:', error);
    });
  }, telemetryRetentionIntervalMs);
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
      site_id: normalizedMessage.site_id || normalizedMessage.siteId || device?.siteId || '',
      tenant_id: normalizedMessage.tenant_id || normalizedMessage.tenantId || device?.tenantId || '',
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

  if (accepted.length > 0) {
    broadcastRealtimeEvent('telemetry', {
      source,
      messages: accepted,
    });
  }

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
    const payloadWithTopic = Array.isArray(payload)
      ? payload.map((item) => ({...item, mqtt_topic: topic}))
      : {...payload, mqtt_topic: topic};
    const filtered = await filterTelemetryPayloadByChannel(runtime.config, payloadWithTopic);
    const accepted = filtered.allowedCount > 0
      ? await ingestTelemetryPayload(filtered.payload, `mqtt:${runtime.config.id}`)
      : [];
    if (accepted.length > 0) {
      runtime.status = {
        ...runtime.status,
        message: filtered.rejectedCount > 0
          ? `Accepted ${accepted.length} telemetry message(s), rejected ${filtered.rejectedCount} outside channel scope`
          : `Accepted ${accepted.length} telemetry message(s) from ${topic}`,
        lastMessageAt: now,
        acceptedCount: (runtime.status.acceptedCount || 0) + accepted.length,
        rejectedCount: (runtime.status.rejectedCount || 0) + filtered.rejectedCount,
      };
    } else {
      runtime.status = {
        ...runtime.status,
        message: filtered.rejectedCount > 0
          ? `MQTT payload on ${topic} was outside this subscriber scope`
          : `MQTT payload on ${topic} did not include a device id and numeric metrics`,
        rejectedCount: (runtime.status.rejectedCount || 0) + Math.max(1, filtered.rejectedCount),
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

app.get('/health', async (_req, res) => {
  const queue = await workflowQueueStatus();
  const timescale = await getTimescaleStatus();
  res.status(200).json({
    status: 'ok',
    workflowQueue: {
      adapter: queue.adapter,
      pending: queue.pending,
      running: queue.running,
      failed: queue.failed,
      rejected: queue.rejected,
    },
    telemetryRetention: {
      enabled: telemetryRetentionState.enabled,
      lastRunAt: telemetryRetentionState.lastRunAt,
      lastError: telemetryRetentionState.lastError,
    },
    timescale: {
      enabled: timescale.enabled,
      available: timescale.available,
      telemetryHypertable: timescale.telemetryHypertable,
      rollupHypertable: timescale.rollupHypertable,
      lastError: timescale.lastError,
    },
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    if (await rejectBlockedIp(req, res, 'register')) return;
    const payload = req.body || {};
    const email = String(payload.email || '').trim().toLowerCase();
    const name = String(payload.name || '').trim();
    const password = String(payload.password || '');
    if (!email || !name || !password) {
      res.status(400).json({ok: false, message: 'Name, email, and password are required.'});
      return;
    }
    const passwordPolicy = validatePasswordPolicy(password, `${name} ${email}`);
    if (!passwordPolicy.ok) {
      await writeAuditLog(req, {id: null, name, role: null}, 'auth.register', 'user', email, 'failed', {reason: 'weak_password'});
      await dispatchSecurityAlert('weak_password_register', {
        email,
        ip: getRequestIp(req),
        message: `Weak password registration attempt for ${email || name || 'unknown user'} from ${getRequestIp(req)}.`,
      });
      res.status(400).json({ok: false, message: passwordPolicy.message});
      return;
    }

    const state = await getDashboardState();
    const users = mergeDefaultAuthUsers(Array.isArray(state.users) ? state.users : []);
    if (users.some((user) => String(user.email || '').toLowerCase() === email)) {
      res.status(409).json({ok: false, message: 'This email is already registered.'});
      return;
    }

    const pendingUser = {
      id: createId('user'),
      name,
      email,
      passwordHash: createPasswordHash(password),
      role: 'Viewer',
      appProfile: payload.appProfile || 'simple',
      siteId: String(payload.siteId || 'factory-a').trim() || 'factory-a',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const nextState = {
      ...state,
      users: [...sanitizeUsersForStorage(Array.isArray(state.users) ? state.users : []), pendingUser],
    };
    await setAppState('dashboard_state', nextState);
    await writeAuditLog(req, publicAuthUser(pendingUser), 'auth.register', 'user', pendingUser.id, 'success', {email});
    res.status(201).json({ok: true, message: 'Registration submitted. Please wait for administrator approval.', user: publicAuthUser(pendingUser)});
  } catch (error) {
    res.status(500).json({ok: false, message: error.message});
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    if (await rejectBlockedIp(req, res, 'login')) return;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const rateLimit = getLoginRateLimitState(req, email);
    if (rateLimit.limited) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      res.status(429).json({
        ok: false,
        message: `Too many failed login attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return;
    }

    const state = await getDashboardState();
    const users = mergeDefaultAuthUsers(Array.isArray(state.users) ? state.users : []);
    const user = users.find((item) => String(item.email || '').toLowerCase() === email);
    if (!user || !verifyPassword(password, user)) {
      const failure = recordLoginFailure(rateLimit.key);
      if (failure.lockedUntil && failure.lockedUntil > Date.now()) {
        const retryAfterSeconds = Math.ceil((failure.lockedUntil - Date.now()) / 1000);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        await dispatchSecurityAlert('login_locked', {
          email,
          ip: getRequestIp(req),
          level: 'Critical',
          message: `Login temporarily locked for ${email || 'unknown account'} from ${getRequestIp(req)} after ${failure.count} failed attempts.`,
        });
        res.status(429).json({ok: false, message: `Too many failed login attempts. Try again in ${retryAfterSeconds} seconds.`, retryAfterSeconds});
        return;
      }
      await writeAuditLog(req, {id: null, name: email, role: null}, 'auth.login', 'user', email, 'failed', {reason: 'invalid_credentials'});
      res.status(401).json({ok: false, message: 'Invalid email or password.'});
      return;
    }
    if (user.status !== 'approved') {
      await writeAuditLog(req, publicAuthUser(user), 'auth.login', 'user', user.id, 'failed', {reason: 'not_approved'});
      await dispatchSecurityAlert('unapproved_login', {
        email,
        ip: getRequestIp(req),
        message: `${user.status || 'Unapproved'} user ${email} attempted to sign in from ${getRequestIp(req)}.`,
      });
      res.status(403).json({ok: false, message: 'Your account is waiting for approval.'});
      return;
    }

    if (!user.passwordHash && user.password && Array.isArray(state.users)) {
      const nextUsers = sanitizeUsersForStorage(state.users);
      await setAppState('dashboard_state', {...state, users: nextUsers});
    }

    clearLoginFailures(rateLimit.key);
    await writeAuditLog(req, publicAuthUser(user), 'auth.login', 'user', user.id, 'success');
    await recordSuccessfulLoginSecurityState(req, user);
    const sessionToken = createSessionToken(user);
    const refreshToken = createRefreshToken(user);
    setAuthCookies(req, res, sessionToken, refreshToken);
    res.status(200).json({
      ok: true,
      message: 'Signed in.',
      user: publicAuthUser(user),
      sessionToken,
      expiresIn: authSessionTtlSeconds,
      refreshExpiresIn: authRefreshTtlSeconds,
    });
  } catch (error) {
    res.status(500).json({ok: false, message: error.message});
  }
});

app.get('/api/auth/session', async (req, res) => {
  try {
    if (await rejectBlockedIp(req, res, 'read session')) return;
    const user = await verifySessionToken(getSessionTokenFromRequest(req));
    if (!user) {
      res.status(401).json({ok: false, message: 'Session expired or invalid.'});
      return;
    }
    res.status(200).json({ok: true, user});
  } catch (error) {
    res.status(500).json({ok: false, message: error.message});
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    if (await rejectBlockedIp(req, res, 'refresh session')) return;
    const currentRefreshToken = getRefreshTokenFromRequest(req);
    const user = await verifyRefreshToken(currentRefreshToken);
    if (!user) {
      clearAuthCookies(req, res);
      await writeAuditLog(req, {id: null, name: '', role: null}, 'auth.refresh', 'session', 'refresh', 'failed', {reason: 'invalid_or_expired_refresh'});
      res.status(401).json({ok: false, message: 'Refresh session expired or invalid.'});
      return;
    }

    await revokeRefreshToken(currentRefreshToken, 'rotated');
    const sessionToken = createSessionToken(user);
    const refreshToken = createRefreshToken(user);
    setAuthCookies(req, res, sessionToken, refreshToken);
    await writeAuditLog(req, user, 'auth.refresh', 'user', user.id, 'success');
    res.status(200).json({
      ok: true,
      message: 'Session refreshed.',
      user,
      sessionToken,
      expiresIn: authSessionTtlSeconds,
      refreshExpiresIn: authRefreshTtlSeconds,
    });
  } catch (error) {
    clearAuthCookies(req, res);
    res.status(500).json({ok: false, message: error.message});
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const actor = await getApiActor(req);
    await revokeRefreshToken(getRefreshTokenFromRequest(req), 'logout');
    clearAuthCookies(req, res);
    if (actor?.id) {
      await writeAuditLog(req, actor, 'auth.logout', 'user', actor.id, 'success');
    }
    res.status(200).json({ok: true, message: 'Signed out.'});
  } catch (error) {
    clearAuthCookies(req, res);
    res.status(200).json({ok: true, message: 'Signed out.'});
  }
});

app.get('/api/ingest-tokens', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'view ingest tokens'))) return;
    res.status(200).json({tokens: ingestTokens.map(publicIngestToken)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/ingest-tokens', async (req, res) => {
  try {
    const actor = await requireApiActorRole(req, res, ['Owner', 'Admin'], 'generate ingest tokens');
    if (!actor) return;
    const payload = req.body || {};
    const token = {
      id: createId('ingest-token'),
      name: String(payload.name || 'Device ingest token').trim(),
      token: createIngestToken(),
      ownerUserId: actor.id,
      ownerName: actor.name || String(payload.ownerName || 'Unknown user'),
      scopes: normalizeIngestTokenScopes(payload.scopes || ['telemetry:write']),
      siteIds: normalizeIngestTokenTargets(payload.siteIds),
      deviceIds: normalizeIngestTokenTargets(payload.deviceIds),
      createdAt: new Date().toISOString(),
      revokedAt: null,
      lastUsedAt: null,
      lastUsedSource: null,
    };
    ingestTokens = [token, ...ingestTokens];
    await saveIngestTokens();
    await writeAuditLog(req, actor, 'ingest_token.create', 'ingest_token', token.id, 'success', {
      scopes: token.scopes,
      siteIds: token.siteIds,
      deviceIds: token.deviceIds,
    });
    res.status(201).json({token: publicIngestToken(token), tokens: ingestTokens.map(publicIngestToken)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/ingest-tokens/:tokenId/revoke', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin'], 'revoke ingest tokens'))) return;
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
    await writeAuditLog(req, await getApiActor(req), 'ingest_token.revoke', 'ingest_token', req.params.tokenId, 'success');
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
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'save data sources'))) return;
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
    await writeAuditLog(req, await getApiActor(req), 'data_sources.save', 'data_source', 'all', 'success', {
      httpChannelCount: httpPushChannels.length,
      mqttChannelCount: mqttChannels.length,
    });
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

app.get('/api/accesses', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'view access control entries'))) return;
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
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'create access control entries'))) return;
    const {accesses, accessCredentials} = await getAccessState();
    const now = new Date().toISOString();
    const payload = req.body || {};
    const access = sanitizeAccessDefinition({
      id: payload.id || createId('access'),
      name: String(payload.name || 'New Access').trim(),
      enabled: payload.enabled !== false,
      method: payload.method || 'qr',
      aesKey: payload.aesKey || '',
      credentialGroups: payload.credentialGroups || [],
      extraParams: payload.extraParams && typeof payload.extraParams === 'object' ? payload.extraParams : {},
      createdAt: now,
      updatedAt: now,
    });
    const nextAccesses = [access, ...accesses.filter((item) => item.id !== access.id)];
    await patchAccessState({accesses: nextAccesses, accessCredentials});
    await writeAuditLog(req, await getApiActor(req), 'access.create', 'access', access.id, 'success', {method: access.method});
    res.status(201).json({access, accesses: nextAccesses});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.put('/api/accesses/:accessId', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'update access control entries'))) return;
    const {accesses, accessCredentials} = await getAccessState();
    const patch = req.body || {};
    let found = false;
    const nextAccesses = accesses.map((access) => {
      if (access.id !== req.params.accessId) return access;
      found = true;
      return sanitizeAccessDefinition({
        ...patch,
        updatedAt: new Date().toISOString(),
      }, access);
    });
    if (!found) {
      res.status(404).json({error: 'access not found'});
      return;
    }
    await patchAccessState({accesses: nextAccesses, accessCredentials});
    await writeAuditLog(req, await getApiActor(req), 'access.update', 'access', req.params.accessId, 'success', {fields: Object.keys(patch)});
    res.status(200).json({accesses: nextAccesses});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.delete('/api/accesses/:accessId', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'delete access control entries'))) return;
    const {accesses, accessCredentials} = await getAccessState();
    const nextAccesses = accesses.filter((access) => access.id !== req.params.accessId);
    const nextCredentials = accessCredentials.filter((credential) => credential.accessId !== req.params.accessId);
    await patchAccessState({accesses: nextAccesses, accessCredentials: nextCredentials});
    await writeAuditLog(req, await getApiActor(req), 'access.delete', 'access', req.params.accessId, 'success', {removedCredentialCount: accessCredentials.length - nextCredentials.length});
    res.status(200).json({accesses: nextAccesses, credentials: nextCredentials.map(publicAccessCredential)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/accesses/:accessId/credentials', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'create access credentials'))) return;
    const {accesses, accessCredentials} = await getAccessState();
    const access = accesses.find((item) => item.id === req.params.accessId);
    if (!access) {
      res.status(404).json({error: 'access not found'});
      return;
    }

    const payload = req.body || {};
    const token = createAccessToken();
    const type = normalizeAccessMethod(payload.type || access.method || 'qr');
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
      type,
      name: String(payload.name || (type === 'nfc' || type === 'nfc_basic' ? 'NFC Tag' : 'QR Code')).trim(),
      tagId: String(payload.tagId || '').trim(),
      groups: normalizeAccessGroups(payload.groups),
      token,
      tokenHash: hashToken(token),
      latestToken: (refreshIntervalSeconds > 0 || Boolean(payload.rotateOnUse)) && maxUses > 1 ? createAccessToken() : null,
      enabled: payload.enabled !== false,
      rotateOnUse: Boolean(payload.rotateOnUse),
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
    await writeAuditLog(req, await getApiActor(req), 'access_credential.create', 'access_credential', credential.id, 'success', {
      accessId: access.id,
      type,
      groups: credential.groups,
      maxUses,
    });
    res.status(201).json({
      credential: publicAccessCredential(credential),
      credentials: nextCredentials.map(publicAccessCredential),
      link: type === 'nfc' ? createNfcDnaAccessLink(req, token) : type === 'nfc_basic' ? createNfcAccessLink(req, token) : createAccessLink(req, token),
      latestQrLink: type === 'qr' && credential.latestToken ? createLatestQrLink(req, credential.latestToken) : null,
    });
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.put('/api/access-credentials/:credentialId', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'update access credentials'))) return;
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
      const nextRotateOnUse = patch.rotateOnUse !== undefined ? Boolean(patch.rotateOnUse) : Boolean(credential.rotateOnUse);
      const shouldHaveLatestToken = (nextRefreshIntervalSeconds > 0 || nextRotateOnUse) && nextMaxUses > 1;
      return {
        ...credential,
        ...patch,
        tagId: patch.tagId !== undefined ? String(patch.tagId || '').trim() : credential.tagId,
        groups: patch.groups !== undefined ? normalizeAccessGroups(patch.groups) : normalizeAccessGroups(credential.groups),
        periodSeconds: nextPeriodSeconds,
        maxUses: nextMaxUses,
        refreshIntervalSeconds: nextRefreshIntervalSeconds,
        rotateOnUse: nextRotateOnUse,
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
    await writeAuditLog(req, await getApiActor(req), 'access_credential.update', 'access_credential', req.params.credentialId, 'success', {fields: Object.keys(patch)});
    res.status(200).json({credentials: nextCredentials.map(publicAccessCredential)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/access-credentials/:credentialId/link', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'view access credential links'))) return;
    const {accesses, accessCredentials} = await getAccessState();
    const credential = accessCredentials.find((item) => item.id === req.params.credentialId);
    if (!credential) {
      res.status(404).json({error: 'credential not found'});
      return;
    }
    if (!credential.token) {
      res.status(409).json({error: 'this credential was created before link viewing was supported; generate a new credential'});
      return;
    }
    const rotated = rotateCredentialIfNeeded(credential, new Date());
    let nextCredentials = accessCredentials;
    if (rotated.rotated) {
      nextCredentials = accessCredentials.map((item) => item.id === credential.id ? rotated.credential : item);
      await patchAccessState({accesses, accessCredentials: nextCredentials});
    }
    await writeAuditLog(req, await getApiActor(req), 'access_credential.view_link', 'access_credential', credential.id, 'success', {type: rotated.credential.type});
    res.status(200).json({
      link: rotated.credential.type === 'nfc'
        ? createNfcDnaAccessLink(req, rotated.credential.token)
        : rotated.credential.type === 'nfc_basic'
          ? createNfcAccessLink(req, rotated.credential.token)
        : createAccessLink(req, rotated.credential.token),
      latestQrLink: rotated.credential.type === 'qr' && rotated.credential.latestToken ? createLatestQrLink(req, rotated.credential.latestToken) : null,
      credentials: nextCredentials.map(publicAccessCredential),
    });
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.delete('/api/access-credentials/:credentialId', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'delete access credentials'))) return;
    const {accesses, accessCredentials} = await getAccessState();
    const nextCredentials = accessCredentials.filter((credential) => credential.id !== req.params.credentialId);
    await patchAccessState({accesses, accessCredentials: nextCredentials});
    if (db) {
      await queryDb('DELETE FROM access_events WHERE credential_id = $1', [req.params.credentialId]);
    } else {
      for (let index = accessEvents.length - 1; index >= 0; index--) {
        if (accessEvents[index].credentialId === req.params.credentialId) accessEvents.splice(index, 1);
      }
    }
    await writeAuditLog(req, await getApiActor(req), 'access_credential.delete', 'access_credential', req.params.credentialId, 'success');
    res.status(200).json({credentials: nextCredentials.map(publicAccessCredential)});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/access-events', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'view access records'))) return;
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

app.delete('/api/access-events', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'clear access records'))) return;
    const accessId = typeof req.query.accessId === 'string' ? req.query.accessId.trim() : '';
    const credentialId = typeof req.query.credentialId === 'string' ? req.query.credentialId.trim() : '';
    if (!accessId && !credentialId) {
      res.status(400).json({error: 'accessId or credentialId is required'});
      return;
    }

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
      await queryDb(`DELETE FROM access_events WHERE ${where.join(' AND ')}`, values);
    } else {
      for (let index = accessEvents.length - 1; index >= 0; index--) {
        const event = accessEvents[index];
        if ((!accessId || event.accessId === accessId) && (!credentialId || event.credentialId === credentialId)) {
          accessEvents.splice(index, 1);
        }
      }
    }

    await writeAuditLog(req, await getApiActor(req), 'access_events.clear', 'access_events', accessId || credentialId, 'success', {accessId, credentialId});
    res.status(200).json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
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
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'save MQTT config'))) return;
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
    await writeAuditLog(req, await getApiActor(req), 'mqtt_config.save', 'mqtt_channel', channel.id, 'success', {
      enabled: channel.enabled,
      topicCount: splitTopics(channel.topics).length,
    });
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

    const filtered = await filterTelemetryPayloadByChannel(channel, req.body);
    if (filtered.allowedCount === 0 && filtered.rejectedCount > 0) {
      res.status(403).json({error: 'telemetry target is outside this HTTP channel scope', accepted: 0, rejected: filtered.rejectedCount});
      return;
    }

    const accepted = await ingestTelemetryPayload(filtered.payload, `http:${channel.id}`);
    res.status(202).json({accepted: accepted.length, rejected: filtered.rejectedCount});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/telemetry', async (req, res) => {
  try {
    const contexts = await getIngestTokenContextsFromPayload(req.body);
    const isAuthorized = await validateIngestToken(req, 'http:legacy', contexts);
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

    const isAuthorized = await validateIngestToken(req, `http:path:${req.path}`, [{
      deviceId: device.id,
      siteId: device.siteId,
    }]);
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

app.get('/api/telemetry/days', async (req, res) => {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : '';

    if (db) {
      const where = [];
      const values = [];
      const addParam = (value) => {
        values.push(value);
        return `$${values.length}`;
      };

      if (from) where.push(`received_at >= ${addParam(from)}::timestamptz`);
      if (to) where.push(`received_at <= ${addParam(to)}::timestamptz`);
      if (deviceId) where.push(`device_id = ${addParam(deviceId)}`);
      if (source) where.push(`source ILIKE ${addParam(`%${source}%`)}`);

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const result = await queryDb(
        `SELECT to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
         FROM telemetry_messages
         ${whereSql}
         GROUP BY day
         ORDER BY day ASC`,
        values
      );
      res.status(200).json({days: result.rows});
      return;
    }

    const byDay = new Map();
    telemetryMessages
      .filter((message) => !from || message.received_at >= from)
      .filter((message) => !to || message.received_at <= to)
      .filter((message) => !deviceId || (message.device_id || message.deviceId || message.id) === deviceId)
      .filter((message) => !source || String(message.source || '').toLowerCase().includes(source.toLowerCase()))
      .forEach((message) => {
        const day = String(message.received_at || message.timestamp || '').slice(0, 10);
        if (!day) return;
        byDay.set(day, (byDay.get(day) || 0) + 1);
      });

    res.status(200).json({
      days: Array.from(byDay.entries())
        .map(([day, count]) => ({day, count}))
        .sort((first, second) => first.day.localeCompare(second.day)),
    });
  } catch (error) {
    res.status(500).json({error: error.message, days: []});
  }
});

app.get('/api/telemetry/rollups', async (req, res) => {
  try {
    const interval = ['minute', 'hour'].includes(String(req.query.interval || 'hour')) ? String(req.query.interval || 'hour') : 'hour';
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId.trim() : '';
    const metric = typeof req.query.metric === 'string' ? req.query.metric.trim() : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : '';
    const limit = Math.max(1, Math.min(Number(req.query.limit || 500), 5000));

    if (db) {
      const where = [`bucket_interval = $1`];
      const values = [interval];
      const addParam = (value) => {
        values.push(value);
        return `$${values.length}`;
      };

      if (from) where.push(`bucket_start >= ${addParam(from)}::timestamptz`);
      if (to) where.push(`bucket_start <= ${addParam(to)}::timestamptz`);
      if (deviceId) where.push(`device_id = ${addParam(deviceId)}`);
      if (siteId) where.push(`site_id = ${addParam(siteId)}`);
      if (metric) where.push(`metric = ${addParam(metric)}`);
      if (source) where.push(`source ILIKE ${addParam(`%${source}%`)}`);
      values.push(limit);

      const result = await queryDb(
        `SELECT bucket_interval AS "interval",
                bucket_start AS "bucketStart",
                device_id AS "deviceId",
                site_id AS "siteId",
                metric,
                source,
                count,
                min_value AS "min",
                max_value AS "max",
                sum_value AS "sum",
                CASE WHEN count > 0 THEN sum_value / count ELSE 0 END AS "avg",
                latest_value AS "latest",
                last_received_at AS "lastReceivedAt"
         FROM telemetry_metric_rollups
         WHERE ${where.join(' AND ')}
         ORDER BY bucket_start ASC
         LIMIT $${values.length}`,
        values
      );
      res.status(200).json({rollups: result.rows});
      return;
    }

    const intervalConfig = telemetryRollupIntervals.find((item) => item.name === interval) || telemetryRollupIntervals[1];
    const filteredMessages = telemetryMessages
      .filter((message) => !from || message.received_at >= from)
      .filter((message) => !to || message.received_at <= to)
      .filter((message) => !deviceId || (message.device_id || message.deviceId || message.id) === deviceId)
      .filter((message) => !siteId || (message.site_id || message.siteId) === siteId)
      .filter((message) => !source || String(message.source || '').toLowerCase().includes(source.toLowerCase()))
      .map((message) => ({
        ...message,
        metrics: metric
          ? Object.fromEntries(Object.entries(message.metrics || {}).filter(([key]) => key === metric))
          : message.metrics || {},
      }));
    const rollups = buildTelemetryRollups(filteredMessages, source || 'memory')
      .filter((rollup) => rollup.bucketInterval === intervalConfig.name)
      .sort((first, second) => new Date(first.bucketStart).getTime() - new Date(second.bucketStart).getTime())
      .slice(0, limit)
      .map((rollup) => ({
        interval: rollup.bucketInterval,
        bucketStart: rollup.bucketStart,
        deviceId: rollup.deviceId,
        siteId: rollup.siteId,
        metric: rollup.metric,
        source: rollup.source,
        count: rollup.count,
        min: rollup.minValue,
        max: rollup.maxValue,
        sum: rollup.sumValue,
        avg: rollup.count ? rollup.sumValue / rollup.count : 0,
        latest: rollup.latestValue,
        lastReceivedAt: rollup.lastReceivedAt,
      }));
    res.status(200).json({rollups});
  } catch (error) {
    res.status(500).json({error: error.message, rollups: []});
  }
});

app.get('/api/telemetry/retention/status', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Partner'], 'view telemetry retention status'))) return;
    res.status(200).json(getTelemetryRetentionStatus());
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/telemetry/retention/run', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin'], 'run telemetry retention cleanup'))) return;
    const status = await runTelemetryRetentionCleanup();
    await writeAuditLog(req, await getApiActor(req), 'telemetry.retention.run', 'telemetry', 'retention', 'success', status);
    res.status(200).json(status);
  } catch (error) {
    telemetryRetentionState.lastError = error.message || 'Telemetry retention cleanup failed.';
    await writeAuditLog(req, await getApiActor(req), 'telemetry.retention.run', 'telemetry', 'retention', 'failed', {error: error.message});
    res.status(500).json({error: error.message, ...getTelemetryRetentionStatus()});
  }
});

app.get('/api/database/timescale/status', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Partner'], 'view TimescaleDB status'))) return;
    res.status(200).json(await getTimescaleStatus());
  } catch (error) {
    res.status(500).json({error: error.message, ...timescaleState});
  }
});

app.post('/api/database/timescale/configure', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin'], 'configure TimescaleDB'))) return;
    await configureTimescaleTelemetry();
    const status = await getTimescaleStatus();
    await writeAuditLog(req, await getApiActor(req), 'database.timescale.configure', 'database', 'timescaledb', status.lastError ? 'failed' : 'success', status);
    res.status(200).json(status);
  } catch (error) {
    timescaleState.lastError = error.message || 'TimescaleDB configuration failed.';
    await writeAuditLog(req, await getApiActor(req), 'database.timescale.configure', 'database', 'timescaledb', 'failed', {error: error.message});
    res.status(500).json({error: error.message, ...timescaleState});
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

app.get('/api/telemetry/compare', async (req, res) => {
  try {
    const metric = typeof req.query.metric === 'string' ? req.query.metric.trim() : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : '';
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const deviceIds = splitList(req.query.deviceIds);
    const rowLimit = Math.max(100, Math.min(Number(req.query.limit || 5000), 20000));

    if (!metric) {
      res.status(400).json({error: 'metric is required', rows: []});
      return;
    }

    const aggregateRows = (items) => {
      const grouped = new Map();
      items.forEach((item) => {
        const value = Number(item.value);
        if (!item.deviceId || !Number.isFinite(value)) return;
        const receivedAt = item.receivedAt || item.received_at || '';
        const current = grouped.get(item.deviceId) || {
          deviceId: item.deviceId,
          count: 0,
          min: value,
          max: value,
          total: 0,
          latest: value,
          latestAt: receivedAt,
          firstAt: receivedAt,
        };
        current.count += 1;
        current.min = Math.min(current.min, value);
        current.max = Math.max(current.max, value);
        current.total += value;
        if (!current.firstAt || (receivedAt && receivedAt < current.firstAt)) current.firstAt = receivedAt;
        if (!current.latestAt || (receivedAt && receivedAt >= current.latestAt)) {
          current.latest = value;
          current.latestAt = receivedAt;
        }
        grouped.set(item.deviceId, current);
      });

      return Array.from(grouped.values())
        .map((item) => ({
          deviceId: item.deviceId,
          count: item.count,
          min: item.min,
          max: item.max,
          avg: item.count ? item.total / item.count : 0,
          latest: item.latest,
          latestAt: item.latestAt,
          firstAt: item.firstAt,
        }))
        .sort((first, second) => String(first.deviceId).localeCompare(String(second.deviceId)));
    };

    if (db) {
      const where = [`metrics ? $1`, `(metrics ->> $1) ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'`];
      const values = [metric];
      const addParam = (value) => {
        values.push(value);
        return `$${values.length}`;
      };

      if (from) where.push(`received_at >= ${addParam(from)}::timestamptz`);
      if (to) where.push(`received_at <= ${addParam(to)}::timestamptz`);
      if (source) where.push(`source ILIKE ${addParam(`%${source}%`)}`);
      if (deviceIds.length) where.push(`device_id = ANY(${addParam(deviceIds)}::text[])`);

      const limitParam = addParam(rowLimit);
      const result = await queryDb(
        `SELECT device_id AS "deviceId",
                received_at AS "receivedAt",
                (metrics ->> $1)::double precision AS value
         FROM telemetry_messages
         WHERE ${where.join(' AND ')}
         ORDER BY received_at ASC
         LIMIT ${limitParam}`,
        values
      );
      res.status(200).json({metric, from, to, rows: aggregateRows(result.rows)});
      return;
    }

    const deviceSet = new Set(deviceIds);
    const rows = telemetryMessages
      .filter((message) => !from || message.received_at >= from)
      .filter((message) => !to || message.received_at <= to)
      .filter((message) => !source || String(message.source || '').toLowerCase().includes(source.toLowerCase()))
      .map((message) => {
        const deviceId = String(message.device_id || message.deviceId || message.id || '');
        return {
          deviceId,
          receivedAt: message.received_at || message.timestamp || '',
          value: Number((message.metrics || {})[metric]),
        };
      })
      .filter((item) => (!deviceSet.size || deviceSet.has(item.deviceId)) && Number.isFinite(item.value))
      .slice(-rowLimit);

    res.status(200).json({metric, from, to, rows: aggregateRows(rows)});
  } catch (error) {
    res.status(500).json({error: error.message, rows: []});
  }
});

app.get('/api/telemetry/query', async (req, res) => {
  try {
    const metric = typeof req.query.metric === 'string' ? req.query.metric.trim() : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : '';
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const deviceIds = splitList(req.query.deviceIds);
    const allowedAggregates = new Set(['avg', 'sum', 'min', 'max', 'latest', 'count']);
    const allowedGroupBy = new Set(['time', 'device', 'device_time']);
    const aggregate = allowedAggregates.has(req.query.aggregate) ? req.query.aggregate : 'avg';
    const groupBy = allowedGroupBy.has(req.query.groupBy) ? req.query.groupBy : 'time';
    const intervalMinutes = Math.max(1, Math.min(Number(req.query.intervalMinutes || 60), 43200));
    const rowLimit = Math.max(100, Math.min(Number(req.query.limit || 10000), 50000));

    if (!metric) {
      res.status(400).json({error: 'metric is required', rows: []});
      return;
    }

    const bucketTime = (value) => {
      const time = new Date(value || '').getTime();
      if (!Number.isFinite(time)) return '';
      const bucketSize = intervalMinutes * 60 * 1000;
      return new Date(Math.floor(time / bucketSize) * bucketSize).toISOString();
    };

    const summarize = (items) => {
      const grouped = new Map();
      items.forEach((item) => {
        const value = Number(item.value);
        if (!Number.isFinite(value) && aggregate !== 'count') return;
        const receivedAt = item.receivedAt || item.received_at || '';
        const bucket = groupBy === 'device' ? '' : bucketTime(receivedAt);
        const deviceId = groupBy === 'time' ? '' : String(item.deviceId || '');
        if (groupBy !== 'time' && !deviceId) return;
        if (groupBy !== 'device' && !bucket) return;
        const key = `${bucket}__${deviceId}`;
        const current = grouped.get(key) || {
          bucket,
          deviceId,
          count: 0,
          sum: 0,
          min: value,
          max: value,
          latest: value,
          latestAt: receivedAt,
        };
        current.count += 1;
        if (Number.isFinite(value)) {
          current.sum += value;
          current.min = Number.isFinite(current.min) ? Math.min(current.min, value) : value;
          current.max = Number.isFinite(current.max) ? Math.max(current.max, value) : value;
          if (!current.latestAt || (receivedAt && receivedAt >= current.latestAt)) {
            current.latest = value;
            current.latestAt = receivedAt;
          }
        }
        grouped.set(key, current);
      });

      return Array.from(grouped.values())
        .map((item) => {
          const aggregateValue = aggregate === 'sum'
            ? item.sum
            : aggregate === 'min'
              ? item.min
              : aggregate === 'max'
                ? item.max
                : aggregate === 'latest'
                  ? item.latest
                  : aggregate === 'count'
                    ? item.count
                    : item.count ? item.sum / item.count : 0;
          return {
            bucket: item.bucket,
            deviceId: item.deviceId,
            aggregate,
            metric,
            value: aggregateValue,
            count: item.count,
            latestAt: item.latestAt,
          };
        })
        .sort((first, second) => String(first.bucket || '').localeCompare(String(second.bucket || '')) || String(first.deviceId || '').localeCompare(String(second.deviceId || '')));
    };

    if (db) {
      const where = [`metrics ? $1`];
      const values = [metric];
      const addParam = (value) => {
        values.push(value);
        return `$${values.length}`;
      };

      if (aggregate !== 'count') where.push(`(metrics ->> $1) ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'`);
      if (from) where.push(`received_at >= ${addParam(from)}::timestamptz`);
      if (to) where.push(`received_at <= ${addParam(to)}::timestamptz`);
      if (source) where.push(`source ILIKE ${addParam(`%${source}%`)}`);
      if (deviceIds.length) where.push(`device_id = ANY(${addParam(deviceIds)}::text[])`);

      const limitParam = addParam(rowLimit);
      const result = await queryDb(
        `SELECT device_id AS "deviceId",
                received_at AS "receivedAt",
                CASE
                  WHEN (metrics ->> $1) ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                  THEN (metrics ->> $1)::double precision
                  ELSE NULL
                END AS value
         FROM telemetry_messages
         WHERE ${where.join(' AND ')}
         ORDER BY received_at ASC
         LIMIT ${limitParam}`,
        values
      );
      res.status(200).json({metric, aggregate, groupBy, intervalMinutes, rows: summarize(result.rows)});
      return;
    }

    const deviceSet = new Set(deviceIds);
    const rows = telemetryMessages
      .filter((message) => !from || message.received_at >= from)
      .filter((message) => !to || message.received_at <= to)
      .filter((message) => !source || String(message.source || '').toLowerCase().includes(source.toLowerCase()))
      .map((message) => {
        const deviceId = String(message.device_id || message.deviceId || message.id || '');
        return {
          deviceId,
          receivedAt: message.received_at || message.timestamp || '',
          value: Number((message.metrics || {})[metric]),
        };
      })
      .filter((item) => (!deviceSet.size || deviceSet.has(item.deviceId)) && (aggregate === 'count' || Number.isFinite(item.value)))
      .slice(-rowLimit);

    res.status(200).json({metric, aggregate, groupBy, intervalMinutes, rows: summarize(rows)});
  } catch (error) {
    res.status(500).json({error: error.message, rows: []});
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

    const isAuthorized = await validateIngestToken(req, 'command:pending', [{
      deviceId: device.id,
      siteId: device.siteId,
    }]);
    if (!isAuthorized) {
      res.status(401).json({error: 'invalid ingest token', commands: []});
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
    const existingCommand = await findDeviceControlCommandById(req.params.commandId);
    const isAuthorized = await validateIngestToken(req, 'command:ack', existingCommand ? [{
      deviceId: existingCommand.deviceId,
    }] : [{}]);
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

app.post('/api/device-commands/:commandId/approve', async (req, res) => {
  try {
    const actor = await requireApiActorRole(req, res, ['Owner', 'Admin'], 'approve dangerous device control commands');
    if (!actor) return;

    const existingCommand = await findDeviceControlCommandById(req.params.commandId);
    if (!existingCommand) {
      res.status(404).json({error: 'command not found'});
      return;
    }
    if (existingCommand.status !== 'pending_approval') {
      res.status(400).json({error: 'command is not waiting for approval', command: existingCommand});
      return;
    }

    const device = await findDashboardDevice(existingCommand.deviceId);
    if (!device) {
      const command = await updateDeviceControlCommand(existingCommand.id, {
        status: 'rejected',
        result: 'Approval failed because the target device no longer exists.',
      });
      res.status(404).json({error: 'device not found', command});
      return;
    }

    const approvedCommand = await updateDeviceControlCommand(existingCommand.id, {
      status: 'queued',
      result: `Approved by ${actor.name || actor.email || actor.id}. Dispatching through configured connector.`,
    });
    const command = await dispatchDeviceControlCommand(approvedCommand || existingCommand, device);

    await writeAuditLog(req, actor, 'device_command.approve', 'device_command', existingCommand.id, 'success', {
      deviceId: existingCommand.deviceId,
      command: existingCommand.command,
      status: command.status,
    });
    res.status(200).json({command});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/device-commands/:commandId/reject', async (req, res) => {
  try {
    const actor = await requireApiActorRole(req, res, ['Owner', 'Admin'], 'reject dangerous device control commands');
    if (!actor) return;

    const existingCommand = await findDeviceControlCommandById(req.params.commandId);
    if (!existingCommand) {
      res.status(404).json({error: 'command not found'});
      return;
    }
    if (existingCommand.status !== 'pending_approval') {
      res.status(400).json({error: 'command is not waiting for approval', command: existingCommand});
      return;
    }

    const command = await updateDeviceControlCommand(existingCommand.id, {
      status: 'rejected',
      result: `Rejected by ${actor.name || actor.email || actor.id}. Command was not sent to the device.`,
    });

    await writeAuditLog(req, actor, 'device_command.reject', 'device_command', existingCommand.id, 'success', {
      deviceId: existingCommand.deviceId,
      command: existingCommand.command,
    });
    res.status(200).json({command});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/device-commands/:commandId/rollback', async (req, res) => {
  try {
    const actor = await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Operator'], 'rollback failed device control commands');
    if (!actor) return;

    const existingCommand = await findDeviceControlCommandById(req.params.commandId);
    if (!existingCommand) {
      res.status(404).json({error: 'command not found'});
      return;
    }
    if (existingCommand.status !== 'failed') {
      res.status(400).json({error: 'only failed commands can be marked rolled back', command: existingCommand});
      return;
    }

    const command = await updateDeviceControlCommand(existingCommand.id, {
      status: 'rolled_back',
      result: `Rolled back by ${actor.name || actor.email || actor.id}. Local control state was restored from the saved snapshot.`,
    });

    await writeAuditLog(req, actor, 'device_command.rollback', 'device_command', existingCommand.id, 'success', {
      deviceId: existingCommand.deviceId,
      command: existingCommand.command,
    });
    res.status(200).json({command});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/device-commands', async (req, res) => {
  try {
    const payload = req.body || {};
    const actor = await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Operator', 'Customer'], 'issue device control commands');
    if (!actor) return;

    const command = await createDeviceControlCommand({
      deviceId: payload.deviceId,
      command: payload.command,
      parameters: payload.parameters || {},
      requestedBy: actor.name || payload.requestedBy || 'Unknown user',
      requestedByRole: actor.role,
      source: 'control-center',
    });

    await writeAuditLog(req, actor, 'device_command.create', 'device', payload.deviceId, command.status === 'rejected' ? 'failed' : 'success', {
      command: payload.command,
      commandId: command.id,
      status: command.status,
    });
    res.status(command.status === 'rejected' ? 404 : 202).json({command});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/device-commands/batch', async (req, res) => {
  try {
    const payload = req.body || {};
    const actor = await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Operator'], 'issue batch device control commands');
    if (!actor) return;

    const deviceIds = splitList(payload.deviceIds);
    if (!deviceIds.length) {
      res.status(400).json({error: 'deviceIds is required', commands: []});
      return;
    }

    const commandName = String(payload.command || '').trim();
    if (!commandName) {
      res.status(400).json({error: 'command is required', commands: []});
      return;
    }

    const uniqueDeviceIds = Array.from(new Set(deviceIds)).slice(0, 100);
    const commands = [];
    for (const deviceId of uniqueDeviceIds) {
      const rollback = payload.rollbackByDevice && typeof payload.rollbackByDevice === 'object'
        ? payload.rollbackByDevice[deviceId]
        : null;
      const command = await createDeviceControlCommand({
        deviceId,
        command: commandName,
        parameters: rollback
          ? {...(payload.parameters || {}), __rollback: rollback}
          : payload.parameters || {},
        requestedBy: actor.name || payload.requestedBy || 'Unknown user',
        requestedByRole: actor.role,
        source: 'control-center-batch',
      });
      commands.push(command);
    }

    await writeAuditLog(req, actor, 'device_command.batch_create', 'device', uniqueDeviceIds.join(','), 'success', {
      command: commandName,
      deviceCount: uniqueDeviceIds.length,
      statuses: commands.reduce((acc, command) => {
        acc[command.status] = (acc[command.status] || 0) + 1;
        return acc;
      }, {}),
      commandIds: commands.map((command) => command.id),
    });

    res.status(202).json({commands});
  } catch (error) {
    res.status(500).json({error: error.message, commands: []});
  }
});

app.post('/api/notification-channels/test', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer'], 'test notification channels'))) return;
    const channel = req.body?.channel;
    if (!channel || typeof channel !== 'object') {
      res.status(400).json({ok: false, message: 'Notification channel payload is required.'});
      return;
    }

    const result = await testNotificationChannel(channel);
    await writeAuditLog(req, await getApiActor(req), 'notification_channel.test', 'notification_channel', channel.id || channel.name || channel.type, result.ok ? 'success' : 'failed', {
      type: channel.type,
      message: result.message,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(200).json({ok: false, message: error.message || 'Notification channel test failed.'});
  }
});

app.get('/api/system-notifications', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
    const notifications = await getSystemNotifications();
    res.status(200).json({notifications: notifications.slice(0, limit)});
  } catch (error) {
    res.status(500).json({error: error.message, notifications: []});
  }
});

app.get('/api/audit-logs', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin'], 'view audit logs'))) return;
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const resultFilter = typeof req.query.result === 'string' ? req.query.result.trim() : '';
    const actorId = typeof req.query.actorId === 'string' ? req.query.actorId.trim() : '';

    if (db) {
      const values = [];
      const where = [];
      const addParam = (value) => {
        values.push(value);
        return `$${values.length}`;
      };
      if (action) where.push(`action = ${addParam(action)}`);
      if (resultFilter) where.push(`result = ${addParam(resultFilter)}`);
      if (actorId) where.push(`actor_id = ${addParam(actorId)}`);
      const limitParam = addParam(limit);
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const queryResult = await queryDb(
        `SELECT id, actor_id AS "actorId", actor_name AS "actorName", actor_role AS "actorRole",
                action, target_type AS "targetType", target_id AS "targetId", result,
                ip, user_agent AS "userAgent", details, created_at AS "createdAt"
         FROM audit_logs
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ${limitParam}`,
        values
      );
      res.status(200).json({logs: queryResult.rows});
      return;
    }

    const logs = auditLogs
      .filter((log) => !action || log.action === action)
      .filter((log) => !resultFilter || log.result === resultFilter)
      .filter((log) => !actorId || log.actorId === actorId)
      .slice(0, limit);
    res.status(200).json({logs});
  } catch (error) {
    res.status(500).json({error: error.message, logs: []});
  }
});

app.post('/api/ai-copilot/chat', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Operator', 'Viewer', 'Partner', 'Customer'], 'use external AI Copilot'))) return;
    const {query = '', localResponse = {}, contextSummary = {}} = req.body || {};
    const result = await callExternalAiCopilot({query, localResponse, contextSummary});
    if (aiCopilotProvider && !['local', 'disabled'].includes(aiCopilotProvider)) {
      await writeAuditLog(req, await getApiActor(req), 'ai_copilot.external', 'ai_copilot', aiCopilotProvider, result.usedExternal ? 'success' : 'failed', {
        provider: result.provider || aiCopilotProvider,
        model: result.model || aiCopilotModel,
        usedExternal: result.usedExternal,
        reason: result.reason || '',
        latencyMs: result.latencyMs,
      });
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(200).json({usedExternal: false, reason: error.message || 'External AI Copilot failed.'});
  }
});

app.get('/api/realtime/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  realtimeClients.add(res);
  sendRealtimeEvent(res, 'connected', {
    type: 'connected',
    connectedAt: new Date().toISOString(),
  });

  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(keepAlive);
      realtimeClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    realtimeClients.delete(res);
  });
});

app.get('/api/state', async (_req, res) => {
  try {
    const state = await getAppState('dashboard_state');
    res.status(200).json({state});
  } catch (error) {
    res.status(500).json({error: error.message, state: null});
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Operator', 'Viewer', 'Partner', 'Customer'], 'view reports'))) return;
    const siteId = String(req.query.siteId || 'All');
    const reports = await getGeneratedReports();
    const filtered = siteId && siteId !== 'All'
      ? reports.filter((report) => report.siteId === siteId || report.siteId === 'All')
      : reports;
    res.status(200).json({reports: filtered});
  } catch (error) {
    res.status(500).json({error: error.message, reports: []});
  }
});

app.post('/api/reports/generate', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Operator', 'Partner', 'Customer'], 'generate reports'))) return;
    const report = await createGeneratedReport(req.body || {});
    await writeAuditLog(req, await getApiActor(req), 'report.generate', 'report', report.id, 'success', {
      name: report.name,
      content: report.content,
      range: report.range,
      siteId: report.siteId,
      source: report.source,
    });
    res.status(201).json({ok: true, report});
  } catch (error) {
    res.status(500).json({ok: false, error: error.message});
  }
});

app.get('/api/reports/:reportId.csv', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Operator', 'Viewer', 'Partner', 'Customer'], 'download reports'))) return;
    const reports = await getGeneratedReports();
    const report = reports.find((item) => item.id === req.params.reportId);
    if (!report) {
      res.status(404).json({error: 'Report not found.'});
      return;
    }
    const fileName = `${String(report.name || report.id).replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.csv`;
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(reportRowsToCsv(report.rows || []));
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/partner-billing/webhook-logs', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Partner'], 'view partner billing webhook logs'))) return;
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
    const logs = await getPartnerBillingWebhookLogs();
    res.status(200).json({logs: logs.slice(0, limit)});
  } catch (error) {
    res.status(500).json({logs: [], error: error.message});
  }
});

app.delete('/api/partner-billing/webhook-logs', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Partner'], 'clear partner billing webhook logs'))) return;
    await savePartnerBillingWebhookLogs([]);
    await writeAuditLog(req, await getApiActor(req), 'partner_billing.webhook_logs.clear', 'partner_billing_webhook_logs', 'all', 'success', {});
    res.status(200).json({ok: true});
  } catch (error) {
    res.status(500).json({ok: false, error: error.message});
  }
});

app.post('/api/partner-billing/webhook-logs/:logId/replay', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Partner'], 'replay partner billing webhook logs'))) return;
    const logs = await getPartnerBillingWebhookLogs();
    const sourceLog = logs.find((log) => log.id === req.params.logId);
    if (!sourceLog) {
      res.status(404).json({ok: false, message: 'Webhook log not found.'});
      return;
    }
    if (!sourceLog.payload || typeof sourceLog.payload !== 'object') {
      res.status(400).json({ok: false, message: 'This webhook log does not contain a replayable payload.'});
      return;
    }
    const result = await processPartnerBillingWebhookPayload(req, sourceLog.payload, {replayedFromLogId: sourceLog.id});
    await writeAuditLog(req, await getApiActor(req), 'partner_billing.webhook_logs.replay', 'partner_billing_webhook_log', sourceLog.id, result.body?.ok ? 'success' : 'failed', {
      httpStatus: result.httpStatus,
      message: result.body?.message,
      invoiceNo: result.body?.invoice?.invoiceNo || result.body?.event?.invoiceNo,
    });
    res.status(result.httpStatus).json({...result.body, replayedFromLogId: sourceLog.id});
  } catch (error) {
    await recordPartnerBillingWebhookLog(req, {
      result: 'failed',
      httpStatus: 500,
      message: `Replay failed: ${error.message}`,
      replayedFromLogId: req.params.logId,
    });
    res.status(500).json({ok: false, error: error.message});
  }
});

app.post('/api/partner-billing/invoices/aging/run', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Partner'], 'run partner invoice aging'))) return;
    const result = await runPartnerInvoiceAging(req);
    res.status(200).json(result);
  } catch (error) {
    await writeAuditLog(req, await getApiActor(req), 'partner_billing.invoice_aging.run', 'partner_invoice', 'overdue_check', 'failed', {
      error: error.message,
    });
    res.status(500).json({ok: false, error: error.message});
  }
});

app.post('/api/partner-billing/webhook', async (req, res) => {
  const state = await getDashboardState();
  const tokenCheck = verifyBillingWebhookToken(req, state);
  if (!tokenCheck.ok) {
    await recordPartnerBillingWebhookLog(req, {
      result: 'failed',
      httpStatus: tokenCheck.status,
      message: tokenCheck.message,
      payload: req.body || {},
    });
    await writeAuditLog(req, {id: 'billing-webhook', name: 'Billing Webhook', role: 'External'}, 'partner_billing.webhook', 'partner_invoice', '', 'failed', {
      reason: tokenCheck.message,
    });
    res.status(tokenCheck.status).json({ok: false, message: tokenCheck.message});
    return;
  }

  try {
    const result = await processPartnerBillingWebhookPayload(req, req.body || {});
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    await recordPartnerBillingWebhookLog(req, {
      result: 'failed',
      httpStatus: 500,
      message: error.message,
      payload: req.body || {},
    });
    await writeAuditLog(req, {id: 'billing-webhook', name: 'Billing Webhook', role: 'External'}, 'partner_billing.webhook', 'partner_invoice', '', 'failed', {
      error: error.message,
    });
    res.status(500).json({ok: false, error: error.message});
  }
});

app.put('/api/state', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Operator', 'Viewer', 'Partner', 'Customer'], 'save dashboard state'))) return;
    const incomingState = req.body || {};
    const currentState = await getDashboardState();
    if (Array.isArray(incomingState.users)) {
      incomingState.users = sanitizeUsersForStorage(incomingState.users);
    }
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
    await writeAuditLog(req, await getApiActor(req), 'state.save', 'dashboard_state', 'dashboard_state', 'success', {
      deviceCount: Array.isArray(incomingState.devices) ? incomingState.devices.length : undefined,
      userCount: Array.isArray(incomingState.users) ? incomingState.users.length : undefined,
      workflowCount: Array.isArray(incomingState.workflows) ? incomingState.workflows.length : undefined,
    });
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
      const executableWorkflow = getExecutableWorkflow(targetWorkflow);
      const trigger = executableWorkflow.nodes.find((node) => node.type === 'trigger' && triggerMatchesEvent(node, event));
      if (trigger && shouldExecuteWorkflowTrigger(executableWorkflow, trigger, event)) {
        await enqueueWorkflowRun({
          workflow: executableWorkflow,
          trigger,
          event,
          reason: 'webhook',
        });
      }
    }

    res.status(202).json({accepted: true, workflowId});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/workflow-queue/status', async (req, res) => {
  try {
    if (!(await requireApiActorRole(req, res, ['Owner', 'Admin', 'Engineer', 'Partner'], 'view workflow queue status'))) return;
    res.status(200).json(await workflowQueueStatus());
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
          `SELECT id, workflow_id AS "workflowId", workflow_name AS "workflowName", workflow_version AS "workflowVersion", trigger_type AS "triggerType",
                  event_source AS "eventSource", status, event, steps, started_at AS "startedAt", finished_at AS "finishedAt"
           FROM workflow_runs
           WHERE workflow_id = $1
           ORDER BY started_at DESC
           LIMIT $2`,
          [workflowId, limit]
        )
        : await queryDb(
          `SELECT id, workflow_id AS "workflowId", workflow_name AS "workflowName", workflow_version AS "workflowVersion", trigger_type AS "triggerType",
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

app.post('/api/workflows/test-node', async (req, res) => {
  try {
    const step = await testWorkflowNode({
      workflow: req.body?.workflow,
      nodeId: req.body?.nodeId,
      event: req.body?.event || {},
      context: req.body?.context || {},
    });
    res.status(200).json({ok: true, step: sanitizeWorkflowLogValue(step)});
  } catch (error) {
    res.status(400).json({ok: false, error: error.message});
  }
});

app.post('/api/workflows/dry-run', async (req, res) => {
  try {
    const run = await dryRunWorkflow({
      workflow: req.body?.workflow,
      triggerId: req.body?.triggerId,
      event: req.body?.event || {},
    });
    res.status(200).json({ok: true, run});
  } catch (error) {
    res.status(400).json({ok: false, error: error.message});
  }
});

app.post('/api/workflows/validate', async (req, res) => {
  try {
    const result = await validateWorkflowDraft(req.body?.workflow);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      issues: [createWorkflowValidationIssue('error', 'validation.failed', error.message)],
      summary: {errors: 1, warnings: 0, info: 0},
    });
  }
});

app.delete('/api/workflow-runs', async (req, res) => {
  try {
    const workflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : '';
    if (db) {
      if (workflowId) {
        await queryDb('DELETE FROM workflow_runs WHERE workflow_id = $1', [workflowId]);
      } else {
        await queryDb('DELETE FROM workflow_runs');
      }
    }

    for (let index = workflowRuns.length - 1; index >= 0; index -= 1) {
      if (!workflowId || workflowRuns[index].workflowId === workflowId) workflowRuns.splice(index, 1);
    }

    res.status(200).json({ok: true, runs: []});
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
    const refreshText = Number(rotated.credential.refreshIntervalSeconds || 0) > 0
      ? `It refreshes every ${rotated.credential.refreshIntervalSeconds}s.`
      : 'It refreshes after each successful scan.';
    sendPage('Latest QR Code', `<h1>${rotated.credential.name || 'Latest QR Code'}</h1><p class="muted">Scan this QR code. ${refreshText}</p><img class="qr" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(accessLink)}" alt="Latest QR"><p class="link">${accessLink}</p><p class="muted">Usage this period: ${rotated.credential.usedCount || 0}/${rotated.credential.maxUses || 1}<br>Valid until: ${expiresAt}</p>`);
  } catch (error) {
    res.status(500).send(`<!doctype html><html><head><title>QR error</title></head><body><h1>QR error</h1><p>${error.message}</p></body></html>`);
  }
});

const handleQrAccessRequest = async (req, res) => {
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
        params: {
          ...(access?.extraParams || {}),
          credentialGroups: normalizeAccessGroups(credential?.groups),
        },
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
    const credentialGroups = normalizeAccessGroups(credential.groups);
    const eventParams = {
      ...(access.extraParams || {}),
      credentialGroups,
    };
    const rotatedToken = credential.rotateOnUse ? createAccessToken() : null;
    const nextCredentials = accessCredentials.map((item) => (
      item.id === credential.id
        ? {
            ...item,
            token: rotatedToken || item.token,
            tokenHash: rotatedToken ? hashToken(rotatedToken) : item.tokenHash,
            usedCount: Number(item.usedCount || 0) + 1,
            lastRotatedAt: rotatedToken ? acceptedAt : item.lastRotatedAt,
            lastUsedAt: acceptedAt,
          }
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
      params: eventParams,
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
      credentialGroups,
      params: eventParams,
      request: requestMeta,
      accessEvent,
      receivedAt: acceptedAt,
    });

    renderAccessPage(202, 'Access accepted', 'Access accepted', access.grantedMessage || 'Access granted.', access.name);
  } catch (error) {
    res.status(500).send(`<!doctype html><html><head><title>Access error</title></head><body><h1>Access error</h1><p>${escapeHtml(error.message)}</p></body></html>`);
  }
};

app.get('/qr/:token', handleQrAccessRequest);
app.get('/a/:token', handleQrAccessRequest);

const handleNfcAccessRequest = async (req, res) => {
  const now = new Date();
  const providedUid = normalizeHex(req.query.uid || '');
  const providedCounter = parseNfcCounter(req.query.ctr ?? req.query.counter);
  const providedCmac = normalizeHex(req.query.cmac || req.query.c || '');
  const requestMeta = {
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
    method: 'GET',
    path: req.path,
    query: req.query || {},
  };

  try {
    const tokenHash = hashToken(req.params.token);
    const {accesses, accessCredentials} = await getAccessState();
    const credential = accessCredentials.find((item) => item.tokenHash === tokenHash && ['nfc', 'nfc_basic'].includes(item.type));
    const access = credential ? accesses.find((item) => item.id === credential.accessId) : null;
    const renderAccessPage = (statusCode, title, heading, message, detail = '') => {
      res.status(statusCode).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f1115;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{max-width:420px;width:calc(100% - 32px);background:#1c2128;border:1px solid #273244;border-radius:12px;padding:24px;text-align:center}.ok{color:#34d399}.denied{color:#fb7185}.muted{color:#94a3b8;font-size:13px;line-height:1.5}.message{font-size:18px;line-height:1.5;white-space:pre-wrap}</style></head><body><main class="card"><h1 class="${statusCode < 400 ? 'ok' : 'denied'}">${escapeHtml(heading)}</h1><p class="message">${escapeHtml(message)}</p>${detail ? `<p class="muted">${escapeHtml(detail)}</p>` : ''}</main></body></html>`);
    };
    const reject = async (statusCode, reason) => {
      await persistAccessEvent({
        id: createId('access-event'),
        accessId: access?.id || credential?.accessId || null,
        credentialId: credential?.id || null,
        credentialType: credential?.type || 'nfc',
        status: 'rejected',
        reason,
        params: {
          ...(access?.extraParams || {}),
          ...(credential?.type === 'nfc' ? {
            uid: credential?.tagId || providedUid,
            counter: providedCounter,
            cmac: providedCmac,
          } : {}),
          credentialGroups: normalizeAccessGroups(credential?.groups),
        },
        request: requestMeta,
        createdAt: now.toISOString(),
      });
      renderAccessPage(statusCode, 'Access denied', 'Access denied', access?.deniedMessage || 'Access denied.', reason);
    };

    if (!credential) {
      await reject(404, 'NFC tag was not found.');
      return;
    }
    if (!access || access.enabled === false) {
      await reject(403, 'Access is disabled.');
      return;
    }
    if (credential.enabled === false) {
      await reject(403, 'NFC tag is disabled.');
      return;
    }
    if (credential.type === 'nfc') {
      if (!providedUid || providedCounter === null || !providedCmac) {
        await reject(400, 'NFC uid, ctr, and cmac are required.');
        return;
      }
      const boundUid = normalizeHex(credential.tagId);
      if (boundUid && boundUid !== providedUid) {
        await reject(403, 'NFC UID does not match this credential.');
        return;
      }
      const cmacResult = verifyNfcCmac({
        aesKey: access.aesKey,
        uid: providedUid,
        counter: providedCounter,
        cmac: providedCmac,
      });
      if (!cmacResult.ok) {
        await reject(403, cmacResult.reason);
        return;
      }
      const lastCounter = Number.isFinite(Number(credential.lastCounter)) ? Number(credential.lastCounter) : -1;
      if (providedCounter <= lastCounter) {
        await reject(409, `NFC counter replay detected. Last accepted counter is ${lastCounter}.`);
        return;
      }
    }
    if (credential.validFrom && now < new Date(credential.validFrom)) {
      await reject(403, 'NFC tag is not active yet.');
      return;
    }
    if (credential.validUntil && now > new Date(credential.validUntil)) {
      await reject(410, 'NFC tag has expired.');
      return;
    }
    if (Number(credential.usedCount || 0) >= Number(credential.maxUses || 1)) {
      await reject(429, 'NFC tag usage limit has been reached.');
      return;
    }

    const acceptedAt = now.toISOString();
    const credentialGroups = normalizeAccessGroups(credential.groups);
    const eventParams = {
      ...(access.extraParams || {}),
      ...(credential.type === 'nfc' ? {
        uid: providedUid,
        tagId: providedUid,
        counter: providedCounter,
        cmac: providedCmac,
      } : {}),
      credentialGroups,
    };
    const nextCredentials = accessCredentials.map((item) => (
      item.id === credential.id
        ? {
            ...item,
            tagId: credential.type === 'nfc' ? (item.tagId || providedUid) : item.tagId,
            usedCount: Number(item.usedCount || 0) + 1,
            lastCounter: credential.type === 'nfc' ? providedCounter : item.lastCounter,
            lastUsedAt: acceptedAt,
          }
        : item
    ));
    await patchAccessState({accesses, accessCredentials: nextCredentials});

    const accessEvent = {
      id: createId('access-event'),
      accessId: access.id,
      credentialId: credential.id,
      credentialType: credential.type || 'nfc',
      status: 'accepted',
      reason: 'Access accepted',
      params: eventParams,
      request: requestMeta,
      createdAt: acceptedAt,
    };
    await persistAccessEvent(accessEvent);

    await dispatchWorkflowEvent({
      type: 'access',
      source: 'nfc',
      accessId: access.id,
      accessName: access.name,
      credentialId: credential.id,
      credentialName: credential.name,
      credentialGroups,
      ...(credential.type === 'nfc' ? {
        tagId: providedUid,
        uid: providedUid,
        counter: providedCounter,
      } : {}),
      params: eventParams,
      request: requestMeta,
      accessEvent,
      receivedAt: acceptedAt,
    });

    renderAccessPage(202, 'Access accepted', 'Access accepted', access.grantedMessage || 'Access granted.', access.name);
  } catch (error) {
    res.status(500).send(`<!doctype html><html><head><title>NFC access error</title></head><body><h1>NFC access error</h1><p>${escapeHtml(error.message)}</p></body></html>`);
  }
};

app.get('/nfc/:token', handleNfcAccessRequest);
app.get('/n/:token', handleNfcAccessRequest);

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
    startWorkflowQueueWorker();
    startTelemetryRetentionWorker();
    startMqttSubscribers();
    runScheduledWorkflows().catch((error) => console.error('Workflow scheduler failed:', error));
    setInterval(() => {
      runScheduledWorkflows().catch((error) => console.error('Workflow scheduler failed:', error));
    }, 30000);
  });
};

startServer();
