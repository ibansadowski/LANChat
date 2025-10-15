module.exports = {
  apps: [{
    name: 'lanchat',
    script: '/root/.bun/bin/bun',
    args: 'run src/server/index.ts',
    cwd: '/root/LANChat',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    max_restarts: 5,           // Stop after 5 restart attempts
    min_uptime: '5s',          // Must stay up 5s to be considered stable
    restart_delay: 3000,       // Wait 3s between restarts
    autorestart: true,
    watch: false,
    error_file: '/root/LANChat/logs/pm2-error.log',
    out_file: '/root/LANChat/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    env: {
      NODE_ENV: 'production',
      PORT: '3000'
    }
  }]
};
