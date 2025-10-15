#!/bin/bash

# View LANChat logs from PM2

exec pm2 logs lanchat "$@"
