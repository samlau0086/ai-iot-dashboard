import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || process.env.VITE_PORT || 3006);
const distDir = path.join(__dirname, 'dist');
const ingestToken = process.env.IOT_INGEST_TOKEN || '';
const telemetryMessages = [];
const maxTelemetryMessages = Number(process.env.IOT_TELEMETRY_BUFFER_SIZE || 500);

app.disable('x-powered-by');
app.use(express.json({limit: '1mb'}));
app.use(express.static(distDir, {
  index: false,
  maxAge: '1h',
}));

app.get('/health', (_req, res) => {
  res.status(200).json({status: 'ok'});
});

app.post('/api/telemetry', (req, res) => {
  if (ingestToken) {
    const providedToken = req.get('x-iot-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (providedToken !== ingestToken) {
      res.status(401).json({error: 'invalid telemetry token'});
      return;
    }
  }

  const payload = req.body;
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
});
