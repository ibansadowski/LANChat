#!/bin/bash

# View LANChat logs from the lanchat user's PM2 instance

LANCHAT_USER="lanchat"

if [ "$(id -u)" -eq 0 ]; then
    # Running as root, view lanchat user's logs
    exec sudo -u ${LANCHAT_USER} pm2 logs lanchat "$@"
else
    # Already running as lanchat user
    exec pm2 logs lanchat "$@"
fi
