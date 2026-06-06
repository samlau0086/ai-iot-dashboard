import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || process.env.VITE_PORT || 3006);
const distDir = path.join(__dirname, 'dist');

app.disable('x-powered-by');
app.use(express.static(distDir, {
  index: false,
  maxAge: '1h',
}));

app.get('/health', (_req, res) => {
  res.status(200).json({status: 'ok'});
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`AI IoT Dashboard is running on port ${port}`);
});
