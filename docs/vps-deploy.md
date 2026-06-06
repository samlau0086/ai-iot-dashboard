# GitHub Actions VPS Deployment

This repository includes a one-click GitHub Actions workflow at `.github/workflows/deploy-vps.yml`.

The production app runs as a Node.js process managed by PM2. The Node server serves the Vite `dist` build and supports SPA fallback routing.

## How it works

- Runs automatically when code is pushed to `main`.
- Can also be started manually from GitHub Actions with **Run workflow**.
- Installs dependencies in GitHub Actions with `npm ci`.
- Runs `npm run lint`.
- Builds the Vite app with `npm run build`.
- Uploads `dist`, `server.js`, `ecosystem.config.cjs`, `package.json`, and `package-lock.json` to your VPS.
- Runs `npm ci --omit=dev` on the VPS.
- Starts or reloads the app with `pm2 startOrReload ecosystem.config.cjs --update-env`.

## Required GitHub Secrets

Add these in your GitHub repository:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

| Secret | Example | Description |
| --- | --- | --- |
| `VPS_HOST` | `203.0.113.10` | VPS IP address or hostname. |
| `VPS_USER` | `deploy` | SSH username. |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Private key used to SSH into the VPS. |
| `VPS_DEPLOY_PATH` | `/var/www/ai-iot-dashboard` | App deployment directory. The workflow creates it automatically with `mkdir -p`, but `VPS_USER` must have permission to create and write to it. |

## Optional GitHub Secrets

| Secret | Example | Description |
| --- | --- | --- |
| `VPS_PORT` | `22` | SSH port. Defaults to `22`. |
| `VPS_APP_PORT` | `3006` | Node app port used by PM2. Defaults to `3006`. |
| `VPS_KNOWN_HOSTS` | Output of `ssh-keyscan -H your-host` | Pins the server host key. If omitted, the workflow runs `ssh-keyscan`. |
| `VPS_POST_DEPLOY` | `sudo systemctl reload nginx` | Command to run on the VPS after PM2 reload. |
| `GEMINI_API_KEY` | `your-api-key` | Passed to the build if the app needs it at build time. |

## VPS setup example

Run this on your VPS once, adjusting the username and path. This ensures the directory exists and the deploy user can write to it:

```bash
sudo mkdir -p /var/www/ai-iot-dashboard
sudo chown -R deploy:deploy /var/www/ai-iot-dashboard
```

Install Node.js and PM2 on the VPS. Example:

```bash
npm install -g pm2
```

After the first successful deployment, you can enable PM2 startup on boot:

```bash
pm2 startup
pm2 save
```

## Nginx reverse proxy example

The app listens on `127.0.0.1:3006` by default through PM2. Point Nginx to the Node process instead of using a static `root`:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3006;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
