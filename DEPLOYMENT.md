# LANChat Deployment Guide

## Architecture Overview

- **Frontend**: Svelte 5 app on Cloudflare Pages (static)
- **Backend**: Bun server with Socket.io on VPS (stateful)
- **Connection**: WebSocket + HTTP API from Cloudflare to VPS

## Prerequisites

- Cloudflare account with Pages access
- VPS with:
  - Bun installed
  - Nginx installed
  - SSL certificate (Let's Encrypt recommended)
  - Domain pointing to VPS

## Step 1: Frontend Deployment (Cloudflare Pages)

### Build Configuration

The frontend is already configured with `@sveltejs/adapter-cloudflare`.

### Deploy via CLI

```bash
cd web
npm install
npm run build

# Install wrangler if not already
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy (first time)
wrangler pages deploy .svelte-kit/cloudflare --project-name=lanchat
```

### Deploy via GitHub

1. Push code to GitHub
2. Go to Cloudflare Dashboard > Pages
3. Connect your GitHub repository
4. Configure build:
   - Build command: `cd web && npm install && npm run build`
   - Build output directory: `web/.svelte-kit/cloudflare`
   - Root directory: `/`

### Environment Variables (Cloudflare)

Add in Cloudflare Pages > Settings > Environment variables:

```
VITE_BACKEND_URL=https://your-vps-domain.com
```

## Step 2: Backend Deployment (VPS)

### Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### Clone and Configure

```bash
cd ~
git clone <your-repo-url> LANChat
cd LANChat
bun install
```

### Environment Variables

Create `.env` file:

```bash
cp .env.example .env
nano .env
```

Configure:
```
HONCHO_API_KEY=your_honcho_api_key
HONCHO_WORKSPACE_ID=default
HONCHO_BASE_URL=http://localhost:8000
PORT=3000
MODEL=your_model
CHAT_SERVER=your_chat_server
```

### Install PM2

```bash
npm install -g pm2
```

### Start Backend

```bash
# Start with PM2
pm2 start bun --name lanchat -- run src/server/index.ts

# Save PM2 configuration
pm2 save

# Enable PM2 startup on boot
pm2 startup
```

### PM2 Useful Commands

```bash
pm2 status          # Check status
pm2 logs lanchat    # View logs
pm2 restart lanchat # Restart
pm2 stop lanchat    # Stop
pm2 delete lanchat  # Delete
```

## Step 3: Nginx Configuration

### Create Nginx Config

```bash
sudo nano /etc/nginx/sites-available/lanchat
```

Add configuration (see `nginx.conf` in this directory).

### Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/lanchat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 4: SSL Certificate

### Using Certbot (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-vps-domain.com
```

## Step 5: Testing

### Test Backend

```bash
curl http://localhost:3000/api/health
```

### Test WebSocket

From frontend, check browser console for connection status.

## Updating Deployment

### Frontend

```bash
cd web
git pull
npm install
npm run build
wrangler pages deploy .svelte-kit/cloudflare --project-name=lanchat
```

Or push to GitHub and Cloudflare will auto-deploy.

### Backend

```bash
cd ~/LANChat
git pull
bun install
pm2 restart lanchat
```

## Troubleshooting

### Check Backend Logs

```bash
pm2 logs lanchat
```

### Check Nginx Logs

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### WebSocket Connection Issues

1. Verify nginx WebSocket upgrade headers
2. Check firewall allows ports 80, 443
3. Verify CORS configuration in backend
4. Check SSL certificate validity

### Common Issues

**Frontend can't connect to backend:**
- Verify VITE_BACKEND_URL is correct in Cloudflare env vars
- Check backend is running: `pm2 status`
- Test backend directly: `curl https://your-domain.com/api/health`

**WebSocket disconnects:**
- Check nginx timeout settings
- Verify Socket.io CORS configuration
- Check firewall rules

**Build fails:**
- Clear `.svelte-kit` folder
- Delete `node_modules` and reinstall
- Check Node/Bun versions
