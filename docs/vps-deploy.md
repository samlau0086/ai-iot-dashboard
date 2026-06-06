# GitHub Actions VPS Deployment

This repository includes a one-click GitHub Actions workflow at `.github/workflows/deploy-vps.yml`.

## How it works

- Runs automatically when code is pushed to `main`.
- Can also be started manually from GitHub Actions with **Run workflow**.
- Installs dependencies with `npm ci`.
- Runs `npm run lint`.
- Builds the Vite app with `npm run build`.
- Uploads the generated `dist` files to your VPS over SSH.
- Replaces the contents of `VPS_DEPLOY_PATH` with the new build.

## Required GitHub Secrets

Add these in your GitHub repository:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

| Secret | Example | Description |
| --- | --- | --- |
| `VPS_HOST` | `203.0.113.10` | VPS IP address or hostname. |
| `VPS_USER` | `deploy` | SSH username. |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Private key used to SSH into the VPS. |
| `VPS_DEPLOY_PATH` | `/var/www/ai-iot-dashboard` | Directory where the built static files should be deployed. The workflow creates it automatically with `mkdir -p`, but `VPS_USER` must have permission to create and write to it. |

## Optional GitHub Secrets

| Secret | Example | Description |
| --- | --- | --- |
| `VPS_PORT` | `22` | SSH port. Defaults to `22`. |
| `VPS_KNOWN_HOSTS` | Output of `ssh-keyscan -H your-host` | Pins the server host key. If omitted, the workflow runs `ssh-keyscan`. |
| `VPS_POST_DEPLOY` | `sudo systemctl reload nginx` | Command to run on the VPS after deployment. |
| `GEMINI_API_KEY` | `your-api-key` | Passed to the build if the app needs it at build time. |

## VPS setup example

Run this on your VPS once, adjusting the username and path. This ensures the directory exists and the deploy user can write to it:

```bash
sudo mkdir -p /var/www/ai-iot-dashboard
sudo chown -R deploy:deploy /var/www/ai-iot-dashboard
```

Point Nginx or your web server root to:

```nginx
root /var/www/ai-iot-dashboard;
index index.html;

location / {
  try_files $uri $uri/ /index.html;
}
```
