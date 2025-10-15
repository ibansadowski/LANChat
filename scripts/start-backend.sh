#!/bin/bash

# Start LANChat backend with PM2 under lanchat user
set -e

LANCHAT_USER="lanchat"
LANCHAT_HOME="/home/${LANCHAT_USER}/LANChat"

# If running as root, switch to lanchat user
if [ "$(id -u)" -eq 0 ]; then
    echo "Running as root, switching to ${LANCHAT_USER} user..."
    exec sudo -u ${LANCHAT_USER} bash "$0" "$@"
fi

cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Copy .env.example to .env and configure it first."
    exit 1
fi

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Error: pm2 is not installed"
    echo "Install with: npm install -g pm2"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
bun install

# Check if already running
if pm2 list | grep -q "lanchat"; then
    echo "LANChat is already running. Restarting..."
    pm2 restart lanchat
else
    echo "Starting LANChat..."
    pm2 start bun --name lanchat -- run src/server/index.ts
fi

# Show status
pm2 status

echo ""
echo "Backend started successfully!"
echo "View logs: pm2 logs lanchat"
echo "Stop: sudo -u ${LANCHAT_USER} pm2 stop lanchat"
echo "Restart: sudo -u ${LANCHAT_USER} pm2 restart lanchat"
