import express from 'express';
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
const maxTelemetryMessages = Number(process.env.IOT_TELEMETRY_BUFFER_SIZE || 500);
const splitTopics = (value) => Array.isArray(value)
  ? value.map((topic) => String(topic).trim()).filter(Boolean)
  : String(value || '').split(',').map((topic) => topic.trim()).filter(Boolean);
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createDefaultHttpChannels = () => [{
  id: 'http-default',
  name: 'Default HTTP Push',
  enabled: true,
  token: ingestToken,
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
const mqttRuntimes = new Map();

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
    fs.writeFileSync(runtimeConfigPath, JSON.stringify({dataSources: {httpPushChannels, mqttChannels}}, null, 2));
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
  await queryDb('CREATE INDEX IF NOT EXISTS idx_telemetry_device_received ON telemetry_messages (device_id, received_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_telemetry_received ON telemetry_messages (received_at DESC)');
  await queryDb('CREATE INDEX IF NOT EXISTS idx_workflow_webhook_events_received ON workflow_webhook_events (workflow_id, received_at DESC)');

  const dataSourceState = await getAppState('data_source_channels');
  if (dataSourceState) {
    httpPushChannels = Array.isArray(dataSourceState.httpPushChannels)
      ? dataSourceState.httpPushChannels
      : httpPushChannels;
    mqttChannels = Array.isArray(dataSourceState.mqttChannels)
      ? dataSourceState.mqttChannels.map((channel) => ({...channel, topics: splitTopics(channel.topics)}))
      : mqttChannels;
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

const mqttStatusFor = (channelId) => mqttRuntimes.get(channelId)?.status || {
  state: 'disabled',
  message: 'MQTT subscriber is disabled',
  connectedAt: null,
  lastMessageAt: null,
};

const mqttStatuses = () => Object.fromEntries(mqttChannels.map((channel) => [channel.id, mqttStatusFor(channel.id)]));

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
    const deviceId = message.device_id || message.deviceId || message.id;
    if (!deviceId || !message.metrics || typeof message.metrics !== 'object') continue;

    accepted.push({
      ...message,
      received_at: new Date().toISOString(),
    });
  }

  telemetryMessages.push(...accepted);
  if (telemetryMessages.length > maxTelemetryMessages) {
    telemetryMessages.splice(0, telemetryMessages.length - maxTelemetryMessages);
  }

  await persistTelemetryMessages(accepted, source);

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

  try {
    const payload = JSON.parse(payloadText);
    const accepted = await ingestTelemetryPayload(
      Array.isArray(payload)
        ? payload.map((item) => ({...item, mqtt_topic: topic}))
        : {...payload, mqtt_topic: topic},
      `mqtt:${runtime.config.id}`
    );
    if (accepted.length > 0) {
      runtime.status = {...runtime.status, lastMessageAt: new Date().toISOString()};
    }
  } catch (error) {
    runtime.status = {...runtime.status, message: `MQTT payload JSON parse failed on ${topic}`};
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
        runtime.status = {state: 'connected', message: 'Connected to MQTT broker', connectedAt: new Date().toISOString(), lastMessageAt: runtime.status.lastMessageAt};
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
  };
  runtime.config = config;
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

app.get('/api/data-sources', (_req, res) => {
  res.status(200).json({
    httpPushChannels: httpPushChannels.map(sanitizeHttpChannel),
    mqttChannels: mqttChannels.map(publicMqttChannel),
    mqttStatuses: mqttStatuses(),
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
    });
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
    if (ingestToken) {
      const providedToken = req.get('x-iot-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (providedToken !== ingestToken) {
        res.status(401).json({error: 'invalid telemetry token'});
        return;
      }
    }

    const accepted = await ingestTelemetryPayload(req.body, 'http:legacy');

    res.status(202).json({accepted: accepted.length});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.get('/api/telemetry', async (req, res) => {
  try {
    const since = typeof req.query.since === 'string' ? req.query.since : '';
    let messages;

    if (db) {
      const result = since
        ? await queryDb(
          `SELECT payload || jsonb_build_object('received_at', received_at, 'mqtt_topic', topic) AS message
           FROM telemetry_messages
           WHERE received_at > $1::timestamptz
           ORDER BY received_at ASC
           LIMIT 500`,
          [since]
        )
        : await queryDb(
          `SELECT payload || jsonb_build_object('received_at', received_at, 'mqtt_topic', topic) AS message
           FROM telemetry_messages
           ORDER BY received_at DESC
           LIMIT 100`
        );
      messages = result.rows.map((row) => row.message);
      if (!since) messages.reverse();
    } else {
      messages = since
        ? telemetryMessages.filter((message) => message.received_at > since)
        : telemetryMessages.slice(-100);
    }

    res.status(200).json({messages});
  } catch (error) {
    res.status(500).json({error: error.message, messages: []});
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
    await setAppState('dashboard_state', req.body || {});
    res.status(200).json({ok: true});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

app.post('/api/workflow-webhooks/:workflowId/:token', async (req, res) => {
  try {
    const {workflowId, token} = req.params;
    const payload = req.body || {};

    if (db) {
      await queryDb(
        `INSERT INTO workflow_webhook_events (workflow_id, token, payload, headers)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
        [workflowId, token, JSON.stringify(payload), JSON.stringify(req.headers)]
      );
    }

    res.status(202).json({accepted: true, workflowId});
  } catch (error) {
    res.status(500).json({error: error.message});
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
  });
};

startServer();
