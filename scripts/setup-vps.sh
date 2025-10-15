#!/bin/bash

# VPS setup script for LANChat backend
set -e

echo "LANChat VPS Setup Script"
echo "========================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo or as root"
    exit 1
fi

# Install Bun if not present
if ! command -v bun &> /dev/null; then
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
else
    echo "Bun already installed: $(bun --version)"
fi

# Install nginx if not present
if ! command -v nginx &> /dev/null; then
    echo "Installing nginx..."
    apt update
    apt install -y nginx
else
    echo "nginx already installed"
fi

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    apt install -y certbot python3-certbot-nginx
else
    echo "certbot already installed"
fi

# Install pm2 if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing pm2..."
    npm install -g pm2
else
    echo "pm2 already installed"
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Clone your repository to ~/LANChat"
echo "2. Copy .env.example to .env and configure"
echo "3. Copy nginx.conf to /etc/nginx/sites-available/lanchat"
echo "4. Update domain names in nginx config"
echo "5. Enable nginx site: sudo ln -s /etc/nginx/sites-available/lanchat /etc/nginx/sites-enabled/"
echo "6. Get SSL certificate: sudo certbot --nginx -d your-domain.com"
echo "7. Start backend: pm2 start bun --name lanchat -- run src/server/index.ts"
echo "8. Save pm2: pm2 save && pm2 startup"
