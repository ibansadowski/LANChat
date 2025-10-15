# LANChat Deployment Quick Start

## TL;DR

**Frontend (Cloudflare Pages):**
```bash
cd web && npm run build
wrangler pages deploy .svelte-kit/cloudflare --project-name=lanchat
```

**Backend (VPS):**
```bash
# On VPS
git clone <repo>
cp .env.production.example .env
nano .env  # Configure
bun install
pm2 start bun --name lanchat -- run src/server/index.ts
pm2 save
```

## Configuration Checklist

### Cloudflare Pages Environment Variables
- `VITE_BACKEND_URL` = `https://your-vps-domain.com`

### VPS Environment Variables (.env)
- `HONCHO_API_KEY` = Your Honcho API key
- `HONCHO_WORKSPACE_ID` = default
- `MODEL` = Your LLM model
- `CHAT_SERVER` = Your chat server
- `PORT` = 3000

### nginx Configuration
1. Copy `nginx.conf` to `/etc/nginx/sites-available/lanchat`
2. Update domain names in config
3. Enable: `sudo ln -s /etc/nginx/sites-available/lanchat /etc/nginx/sites-enabled/`
4. Test: `sudo nginx -t`
5. Reload: `sudo systemctl reload nginx`

### SSL Certificate
```bash
sudo certbot --nginx -d your-domain.com
```

## Helper Scripts

All scripts are in the `scripts/` directory:

- `deploy-frontend.sh` - Build and deploy frontend
- `setup-vps.sh` - Initial VPS setup (run as root)
- `start-backend.sh` - Start backend with PM2

## Testing

### Test Backend Locally
```bash
bun run dev
```

### Test Frontend Locally
```bash
cd web && npm run dev
```

### Test Production Build
```bash
cd web && npm run build && npm run preview
```

### Test Backend on VPS
```bash
curl https://your-domain.com/api/stats
```

## Monitoring

```bash
# Backend logs
pm2 logs lanchat

# nginx logs
sudo tail -f /var/log/nginx/lanchat_error.log

# System resources
pm2 monit
```

## Common Issues

**WebSocket won't connect:**
- Check nginx config has WebSocket upgrade headers
- Verify firewall allows ports 80, 443
- Check CORS origin in nginx config matches Cloudflare URL

**Backend crashes:**
- Check environment variables are set: `pm2 env lanchat`
- View error logs: `pm2 logs lanchat --err`
- Check Honcho API key is valid

**Frontend build fails:**
- Delete `.svelte-kit` and `node_modules`, rebuild
- Check Node version: `node --version` (need 18+)

## URLs to Update

Before deploying, update these URLs:

1. `nginx.conf` lines:
   - Line 2: `server_name your-vps-domain.com`
   - Line 8: `server_name your-vps-domain.com`
   - Lines 11-12: SSL certificate paths
   - Line 20: `add_header Access-Control-Allow-Origin "https://your-cloudflare-pages-url.pages.dev"`

2. Cloudflare Pages env vars:
   - `VITE_BACKEND_URL=https://your-vps-domain.com`

## Production Readiness Checklist

- [ ] Frontend builds without errors
- [ ] Backend starts without errors locally
- [ ] Environment variables configured
- [ ] Domain DNS points to VPS
- [ ] nginx installed and configured
- [ ] SSL certificate obtained
- [ ] Backend running with PM2
- [ ] Frontend deployed to Cloudflare
- [ ] WebSocket connection works
- [ ] Test sending messages end-to-end
