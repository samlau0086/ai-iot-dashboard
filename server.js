import express from 'express';
import fs from 'fs';
import net from 'net';
import path from 'path';
import tls from 'tls';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || process.env.VITE_PORT || 3006);
const distDir = path.join(__dirname, 'dist');
const runtimeConfigPath = path.join(__dirname, 'runtime-config.json');
const ingestToken = process.env.IOT_INGEST_TOKEN || '';
const telemetryMessages = [];
const maxTelemetryMessages = Number(process.env.IOT_TELEMETRY_BUFFER_SIZE || 500);
let mqttConfig = {
  enabled: process.env.MQTT_ENABLED === 'true',
  brokerUrl: process.env.MQTT_BROKER_URL || '',
  username: process.env.MQTT_USERNAME || '',
  password: process.env.MQTT_PASSWORD || '',
  topics: (process.env.MQTT_TOPICS || '').split(',').map((topic) => topic.trim()).filter(Boolean),
};
let mqttStatus = {state: 'disabled', message: 'MQTT subscriber is disabled', connectedAt: null, lastMessageAt: null};
let mqttSocket = null;
let mqttReconnectTimer = null;
let mqttPingTimer = null;
let mqttPacketId = 1;
let mqttBuffer = Buffer.alloc(0);

try {
  if (fs.existsSync(runtimeConfigPath)) {
    const runtimeConfig = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
    if (runtimeConfig.mqttConfig) {
      mqttConfig = {
        ...mqttConfig,
        ...runtimeConfig.mqttConfig,
        topics: Array.isArray(runtimeConfig.mqttConfig.topics) ? runtimeConfig.mqttConfig.topics : mqttConfig.topics,
      };
    }
  }
} catch (error) {
  console.warn('Failed to load runtime config:', error.message);
}

const saveRuntimeConfig = () => {
  fs.writeFileSync(runtimeConfigPath, JSON.stringify({mqttConfig}, null, 2));
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

const createMqttSubscribePacket = (topics) => {
  const packetId = mqttPacketId++;
  const packetIdBuffer = Buffer.alloc(2);
  packetIdBuffer.writeUInt16BE(packetId, 0);
  const subscriptions = topics.map((topic) => Buffer.concat([encodeMqttString(topic), Buffer.from([0])]));

  return createMqttPacket(0x82, Buffer.concat([packetIdBuffer, ...subscriptions]));
};

const ingestTelemetryPayload = (payload) => {
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

  return accepted;
};

const stopMqttSubscriber = () => {
  if (mqttReconnectTimer) {
    clearTimeout(mqttReconnectTimer);
    mqttReconnectTimer = null;
  }
  if (mqttPingTimer) {
    clearInterval(mqttPingTimer);
    mqttPingTimer = null;
  }
  if (mqttSocket) {
    mqttSocket.destroy();
    mqttSocket = null;
  }
  mqttBuffer = Buffer.alloc(0);
};

const scheduleMqttReconnect = () => {
  if (!mqttConfig.enabled || mqttReconnectTimer) return;
  mqttReconnectTimer = setTimeout(() => {
    mqttReconnectTimer = null;
    startMqttSubscriber();
  }, 5000);
};

const createMqttPubackPacket = (packetId) => {
  const packetIdBuffer = Buffer.alloc(2);
  packetIdBuffer.writeUInt16BE(packetId, 0);
  return createMqttPacket(0x40, packetIdBuffer);
};

const handleMqttPublish = (packet, flags) => {
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
    mqttSocket?.write(createMqttPubackPacket(packetId));
  }

  const payloadText = packet.slice(payloadStart).toString();

  try {
    const payload = JSON.parse(payloadText);
    const accepted = ingestTelemetryPayload(
      Array.isArray(payload)
        ? payload.map((item) => ({...item, mqtt_topic: topic}))
        : {...payload, mqtt_topic: topic}
    );
    if (accepted.length > 0) {
      mqttStatus = {...mqttStatus, lastMessageAt: new Date().toISOString()};
    }
  } catch (error) {
    mqttStatus = {...mqttStatus, message: `MQTT payload JSON parse failed on ${topic}`};
  }
};

const handleMqttData = (chunk) => {
  mqttBuffer = Buffer.concat([mqttBuffer, chunk]);

  while (mqttBuffer.length >= 2) {
    let multiplier = 1;
    let remainingLength = 0;
    let offset = 1;
    let encodedByte = 0;

    do {
      if (offset >= mqttBuffer.length) return;
      encodedByte = mqttBuffer[offset++];
      remainingLength += (encodedByte & 127) * multiplier;
      multiplier *= 128;
    } while ((encodedByte & 128) !== 0);

    const packetEnd = offset + remainingLength;
    if (mqttBuffer.length < packetEnd) return;

    const fixedHeader = mqttBuffer[0];
    const packetType = fixedHeader >> 4;
    const flags = fixedHeader & 0x0f;
    const packet = mqttBuffer.slice(offset, packetEnd);
    mqttBuffer = mqttBuffer.slice(packetEnd);

    if (packetType === 2) {
      const returnCode = packet[1];
      if (returnCode === 0) {
        mqttStatus = {state: 'connected', message: 'Connected to MQTT broker', connectedAt: new Date().toISOString(), lastMessageAt: mqttStatus.lastMessageAt};
        if (mqttConfig.topics.length > 0) {
          mqttSocket?.write(createMqttSubscribePacket(mqttConfig.topics));
        }
      } else {
        mqttStatus = {state: 'error', message: `MQTT CONNACK rejected with code ${returnCode}`, connectedAt: null, lastMessageAt: mqttStatus.lastMessageAt};
        mqttSocket?.destroy();
      }
    }

    if (packetType === 3) {
      handleMqttPublish(packet, flags);
    }
  }
};

const startMqttSubscriber = () => {
  stopMqttSubscriber();

  if (!mqttConfig.enabled) {
    mqttStatus = {state: 'disabled', message: 'MQTT subscriber is disabled', connectedAt: null, lastMessageAt: mqttStatus.lastMessageAt};
    return;
  }

  if (!mqttConfig.brokerUrl || mqttConfig.topics.length === 0) {
    mqttStatus = {state: 'error', message: 'MQTT broker URL and at least one topic are required', connectedAt: null, lastMessageAt: mqttStatus.lastMessageAt};
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(mqttConfig.brokerUrl);
    mqttConfig = {
      ...mqttConfig,
      username: mqttConfig.username || decodeURIComponent(parsedUrl.username || ''),
      password: mqttConfig.password || decodeURIComponent(parsedUrl.password || ''),
    };
  } catch (error) {
    mqttStatus = {state: 'error', message: 'Invalid MQTT broker URL', connectedAt: null, lastMessageAt: mqttStatus.lastMessageAt};
    return;
  }

  const isTls = parsedUrl.protocol === 'mqtts:';
  if (!isTls && parsedUrl.protocol !== 'mqtt:') {
    mqttStatus = {state: 'error', message: 'Only mqtt:// and mqtts:// broker URLs are supported by the backend subscriber', connectedAt: null, lastMessageAt: mqttStatus.lastMessageAt};
    return;
  }

  mqttStatus = {state: 'connecting', message: 'Connecting to MQTT broker', connectedAt: null, lastMessageAt: mqttStatus.lastMessageAt};
  const portNumber = Number(parsedUrl.port || (isTls ? 8883 : 1883));
  const connectionOptions = {host: parsedUrl.hostname, port: portNumber};

  mqttSocket = isTls ? tls.connect(connectionOptions) : net.connect(connectionOptions);

  mqttSocket.on('connect', () => {
    mqttSocket?.write(createMqttConnectPacket(mqttConfig));
    mqttPingTimer = setInterval(() => {
      mqttSocket?.write(Buffer.from([0xc0, 0x00]));
    }, 25000);
  });

  mqttSocket.on('data', handleMqttData);
  mqttSocket.on('error', (error) => {
    mqttStatus = {state: 'error', message: error.message, connectedAt: null, lastMessageAt: mqttStatus.lastMessageAt};
  });
  mqttSocket.on('close', () => {
    if (mqttPingTimer) {
      clearInterval(mqttPingTimer);
      mqttPingTimer = null;
    }
    mqttSocket = null;
    if (mqttConfig.enabled) {
      mqttStatus = {state: 'reconnecting', message: 'MQTT connection closed, reconnecting', connectedAt: null, lastMessageAt: mqttStatus.lastMessageAt};
      scheduleMqttReconnect();
    }
  });
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

app.get('/api/mqtt/config', (_req, res) => {
  res.status(200).json({
    config: {
      enabled: mqttConfig.enabled,
      brokerUrl: mqttConfig.brokerUrl,
      username: mqttConfig.username,
      topics: mqttConfig.topics,
    },
    status: mqttStatus,
  });
});

app.post('/api/mqtt/config', (req, res) => {
  const nextConfig = req.body || {};
  mqttConfig = {
    enabled: Boolean(nextConfig.enabled),
    brokerUrl: String(nextConfig.brokerUrl || '').trim(),
    username: String(nextConfig.username || '').trim(),
    password: String(nextConfig.password || ''),
    topics: Array.isArray(nextConfig.topics)
      ? nextConfig.topics.map((topic) => String(topic).trim()).filter(Boolean)
      : String(nextConfig.topics || '').split(',').map((topic) => topic.trim()).filter(Boolean),
  };
  saveRuntimeConfig();

  startMqttSubscriber();
  res.status(200).json({
    config: {
      enabled: mqttConfig.enabled,
      brokerUrl: mqttConfig.brokerUrl,
      username: mqttConfig.username,
      topics: mqttConfig.topics,
    },
    status: mqttStatus,
  });
});

app.post('/api/telemetry', (req, res) => {
  if (ingestToken) {
    const providedToken = req.get('x-iot-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (providedToken !== ingestToken) {
      res.status(401).json({error: 'invalid telemetry token'});
      return;
    }
  }

  const accepted = ingestTelemetryPayload(req.body);

  res.status(202).json({accepted: accepted.length});
});

app.get('/api/telemetry', (req, res) => {
  const since = typeof req.query.since === 'string' ? req.query.since : '';
  const messages = since
    ? telemetryMessages.filter((message) => message.received_at > since)
    : telemetryMessages.slice(-100);

  res.status(200).json({messages});
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`AI IoT Dashboard is running on port ${port}`);
  startMqttSubscriber();
});
